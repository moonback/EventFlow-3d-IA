/**
 * Amorçage d'une organisation RÉELLE et de son propriétaire (aucune donnée de démonstration).
 *
 *   ORG_NAME="Mon Agence" OWNER_EMAIL="direction@mon-agence.fr" OWNER_NAME="Prénom Nom" \
 *     npm run org:create
 *
 * - Crée l'organisation, ses emplacements système (entrepôt, préparation, retour, quarantaine,
 *   atelier, sortie) et le compte propriétaire.
 * - Aucun mot de passe n'est défini ni affiché : le script émet un lien de définition du mot de
 *   passe à usage unique, valable 24 h, à transmettre au propriétaire par un canal sûr.
 * - Si l'utilisateur existe déjà, il est simplement ajouté comme propriétaire.
 * - Refuse de s'exécuter si une organisation porte déjà ce nom de code (slug).
 */
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient, type LocationKind } from "@prisma/client";
import { hashPassword } from "../src/server/auth/password";

const db = new PrismaClient();

const SYSTEM_LOCATIONS: { code: string; name: string; kind: LocationKind }[] = [
  { code: "ENT", name: "Entrepôt principal", kind: "WAREHOUSE" },
  { code: "PREP", name: "Zone de préparation", kind: "PREPARATION" },
  { code: "RET", name: "Zone de retour", kind: "RETURN" },
  { code: "QUAR", name: "Quarantaine (endommagé)", kind: "QUARANTINE" },
  { code: "ATELIER", name: "Atelier maintenance", kind: "MAINTENANCE" },
  { code: "SORTIE", name: "Matériel sorti (transit / sur site)", kind: "OUT" },
];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function main() {
  const orgName = process.env.ORG_NAME?.trim();
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const ownerName = process.env.OWNER_NAME?.trim();
  const timezone = process.env.ORG_TIMEZONE?.trim() || "Europe/Paris";
  const appUrl = process.env.APP_URL?.trim() || "http://localhost:3000";
  if (!orgName || !email || !ownerName)
    throw new Error("ORG_NAME, OWNER_EMAIL et OWNER_NAME sont obligatoires");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("OWNER_EMAIL invalide");
  const slug = slugify(orgName);
  if (!slug) throw new Error("ORG_NAME invalide");
  if (await db.organization.findUnique({ where: { slug } }))
    throw new Error(`Une organisation « ${slug} » existe déjà : rien n'a été modifié`);

  const result = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName, slug, timezone, isDemo: false } });
    await tx.stockLocation.createMany({
      data: SYSTEM_LOCATIONS.map((l) => ({ ...l, organizationId: org.id })),
    });
    let user = await tx.user.findUnique({ where: { email }, select: { id: true } });
    let token: string | null = null;
    if (!user) {
      // Empreinte d'un secret aléatoire jeté : aucune connexion possible avant définition du mot de passe
      user = await tx.user.create({
        data: {
          email,
          name: ownerName,
          passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        },
        select: { id: true },
      });
      token = randomBytes(32).toString("base64url");
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 24 * 3_600_000),
        },
      });
    }
    await tx.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
    await tx.auditLog.create({
      data: {
        organizationId: org.id,
        actorId: null,
        action: "organization.created",
        entityType: "Organization",
        entityId: org.id,
        changes: { via: "scripts/create-organization", owner: email },
      },
    });
    return { org, token };
  });

  console.log(`Organisation créée : ${result.org.name} (${result.org.slug})`);
  if (result.token) {
    console.log("Lien de définition du mot de passe (usage unique, 24 h) — à transmettre par un canal sûr :");
    console.log(`${appUrl}/reset-password?token=${encodeURIComponent(result.token)}`);
  } else {
    console.log(`Le compte ${email} existait déjà : il est propriétaire de la nouvelle organisation.`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
