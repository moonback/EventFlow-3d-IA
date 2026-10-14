import "server-only";
import { Prisma, type LocationKind, type NotificationType, type Role } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";

/** Emplacements dont le contenu fait partie du stock mobilisable (cf. BUSINESS_RULES). */
export const STORAGE_KINDS: LocationKind[] = ["WAREHOUSE", "ZONE", "RACK", "BIN"];
export const UNSERVICEABLE_KINDS: LocationKind[] = ["QUARANTINE", "MAINTENANCE"];
export const SERVICEABLE_KINDS: LocationKind[] = [...STORAGE_KINDS, "PREPARATION", "RETURN", "OUT"];

export function isStorageKind(kind: LocationKind) {
  return STORAGE_KINDS.includes(kind);
}

/**
 * Numérotation séquentielle sans trou : incrément atomique dans la transaction appelante
 * (annulé avec elle en cas d'échec). Format : PREFIX-AAAA-NNNN.
 */
export async function nextDocumentNumber(tx: Tx, organizationId: string, kind: string, prefix: string, date = new Date(), pad = 4) {
  const year = date.getUTCFullYear();
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "DocumentSequence" ("id", "organizationId", "kind", "year", "nextValue")
    VALUES (${`seq_${organizationId}_${kind}_${year}`}, ${organizationId}, ${kind}, ${year}, 2)
    ON CONFLICT ("organizationId", "kind", "year")
    DO UPDATE SET "nextValue" = "DocumentSequence"."nextValue" + 1
    RETURNING "nextValue" - 1 AS value`;
  const value = rows[0]?.value;
  if (!value) throw new Error("Sequence allocation failed");
  return `${prefix}-${year}-${String(value).padStart(pad, "0")}`;
}

/** Verrouille les lignes produit (ordre stable → pas d'interblocage) pour sérialiser les opérations de stock. */
export async function lockProducts(tx: Tx, organizationId: string, productIds: string[]) {
  const ids = [...new Set(productIds)].sort();
  if (ids.length === 0) return;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "EquipmentProduct"
    WHERE "organizationId" = ${organizationId} AND "id" IN (${Prisma.join(ids)})
    ORDER BY "id" FOR UPDATE`;
  if (rows.length !== ids.length) throw new NotFoundError("Produit");
}

/** Emplacement système par nature (préparation, retour, quarantaine, maintenance, sortie). */
export async function getSystemLocation(tx: Tx, organizationId: string, kind: LocationKind) {
  const location = await tx.stockLocation.findFirst({
    where: { organizationId, kind, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, kind: true },
  });
  if (location) return location;
  if (kind === "OUT") {
    return tx.stockLocation.create({
      data: { organizationId, kind: "OUT", code: "SORTIE", name: "Matériel sorti (transit / sur site)" },
      select: { id: true, code: true, name: true, kind: true },
    });
  }
  throw new BusinessRuleError(
    "MISSING_SYSTEM_LOCATION",
    `Aucun emplacement de type « ${kind} » n'est configuré. Créez-le dans Entrepôt > Emplacements.`,
  );
}

/** Crée une notification interne pour les membres ayant l'un des rôles cibles. */
export async function notifyRoles(
  tx: Tx,
  organizationId: string,
  roles: Role[],
  notification: { type: NotificationType; title: string; body?: string; link?: string; dedupeKey?: string },
) {
  const members = await tx.membership.findMany({
    where: { organizationId, isActive: true, role: { in: roles } },
    select: { userId: true },
  });
  if (members.length === 0) return 0;
  const prefs = await tx.notificationPreference.findMany({
    where: { organizationId, type: notification.type, userId: { in: members.map((m) => m.userId) }, inApp: false },
    select: { userId: true },
  });
  const muted = new Set(prefs.map((p) => p.userId));
  const recipients = members.filter((m) => !muted.has(m.userId));
  const result = await tx.notification.createMany({
    data: recipients.map((m) => ({
      organizationId,
      userId: m.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      dedupeKey: notification.dedupeKey ? `${notification.dedupeKey}` : null,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export const MANAGEMENT_ROLES: Role[] = ["OWNER", "ADMIN", "DIRECTOR"];
export const LOGISTICS_ROLES: Role[] = ["OWNER", "ADMIN", "LOGISTICS_MANAGER", "STOCK_MANAGER"];
export const SALES_ROLES: Role[] = ["OWNER", "ADMIN", "DIRECTOR", "SALES"];
export const FINANCE_ROLES: Role[] = ["OWNER", "ADMIN", "DIRECTOR", "ACCOUNTING"];

/** Exécute une transaction avec quelques tentatives en cas de conflit de sérialisation / interblocage. */
export async function withRetry<T>(fn: (tx: Tx) => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await db.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      const message = error instanceof Error ? error.message : "";
      const retryable = code === "P2034" || /deadlock detected|could not serialize/i.test(message);
      if (!retryable) throw error;
      lastError = error;
      await new Promise((r) => setTimeout(r, 20 * (i + 1) + Math.random() * 30));
    }
  }
  throw lastError;
}
