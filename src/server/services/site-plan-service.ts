import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BusinessRuleError } from "@/lib/errors";
import { defaultSitePlan } from "@/features/site-plan/default-plan";
import { sitePlanSchema, type SitePlan } from "@/features/site-plan/schema";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { snapshotLayout } from "./scene-service";

/**
 * Plan du site enregistré par l'organisation, ou plan par défaut (révision 0) s'il n'en a pas.
 * Un document illisible (format obsolète, corruption) retombe sur le plan par défaut sans casser la scène.
 */
export async function loadSitePlan(organizationId: string): Promise<{ plan: SitePlan; revision: number; custom: boolean }> {
  const row = await db.sitePlan.findUnique({ where: { organizationId }, select: { plan: true, revision: true } });
  if (!row) return { plan: defaultSitePlan(), revision: 0, custom: false };
  const parsed = sitePlanSchema.safeParse(row.plan);
  if (!parsed.success) {
    console.error("[site-plan] plan illisible, plan par défaut affiché", { organizationId });
    return { plan: defaultSitePlan(), revision: row.revision, custom: false };
  }
  return { plan: parsed.data, revision: row.revision, custom: true };
}

const conflict = () => new BusinessRuleError("SITE_PLAN_CONFLICT", "Le plan du site a été modifié entre-temps par un autre utilisateur. Rechargez-le avant d'enregistrer.");

async function ensureInitialVersion(ctx: AuthContext) {
  if ((await db.sceneLayoutVersion.count({ where: { organizationId: ctx.organizationId } })) === 0) await snapshotLayout(ctx, "État initial");
}

/**
 * Enregistre le plan du site (contrôle de version optimiste : `revision` est celle sur laquelle
 * l'utilisateur a travaillé) puis crée une version de l'agencement.
 */
export async function saveSitePlan(ctx: AuthContext, input: { revision: number; plan: SitePlan; label?: string }) {
  assertCan(ctx, "scene:edit");
  const plan = sitePlanSchema.parse(input.plan);
  await ensureInitialVersion(ctx);
  const data = { plan: plan as unknown as Prisma.InputJsonValue, updatedByName: ctx.user.name };
  let revision: number;
  if (input.revision === 0) {
    try {
      await db.sitePlan.create({ data: { organizationId: ctx.organizationId, ...data, revision: 1 } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict();
      throw e;
    }
    revision = 1;
  } else {
    const updated = await db.sitePlan.updateMany({ where: { organizationId: ctx.organizationId, revision: input.revision }, data: { ...data, revision: { increment: 1 } } });
    if (updated.count === 0) throw conflict();
    revision = input.revision + 1;
  }
  const label = input.label?.trim() || `Plan du site : ${plan.walls.length} mur(s), ${plan.rooms.length} pièce(s), ${plan.props.length} accessoire(s)`;
  const version = await snapshotLayout(ctx, label);
  await audit(ctx, "scene.site_plan_saved", "SitePlan", ctx.organizationId, { revision, walls: plan.walls.length, openings: plan.openings.length, rooms: plan.rooms.length, props: plan.props.length });
  return { revision, versionId: version.id };
}

/** Revient au plan par défaut (le plan précédent reste récupérable dans l'historique des versions). */
export async function resetSitePlan(ctx: AuthContext) {
  assertCan(ctx, "scene:edit");
  await ensureInitialVersion(ctx);
  await db.sitePlan.deleteMany({ where: { organizationId: ctx.organizationId } });
  const version = await snapshotLayout(ctx, "Plan du site : retour au plan par défaut");
  await audit(ctx, "scene.site_plan_reset", "SitePlan", ctx.organizationId, {});
  return { revision: 0, versionId: version.id };
}

/** Restaure le plan d'une version (appelé par la restauration d'une version d'agencement). */
export async function restoreSitePlan(tx: Prisma.TransactionClient, organizationId: string, snapshot: unknown, userName: string) {
  const parsed = sitePlanSchema.safeParse(snapshot);
  if (!parsed.success) return false;
  const plan = parsed.data as unknown as Prisma.InputJsonValue;
  await tx.sitePlan.upsert({
    where: { organizationId },
    create: { organizationId, plan, revision: 1, updatedByName: userName },
    update: { plan, revision: { increment: 1 }, updatedByName: userName },
  });
  return true;
}
