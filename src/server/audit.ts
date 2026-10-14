import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";

type AuditChanges = Record<string, string | number | boolean | null | undefined | string[]>;

/**
 * Journalise une opération sensible. Ne JAMAIS y placer de secrets ou de données
 * personnelles superflues : uniquement des identifiants et des champs métier modifiés.
 */
export async function audit(
  ctx: { organizationId: string; userId: string | null; ipAddress?: string | null },
  action: string,
  entityType: string,
  entityId: string | null,
  changes?: AuditChanges,
  tx: Tx = db,
) {
  await tx.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      action,
      entityType,
      entityId,
      changes: (changes ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: ctx.ipAddress ?? null,
    },
  });
}

/** Différences champ par champ entre deux objets simples (pour l'historique). */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): AuditChanges {
  const changes: AuditChanges = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    const norm = (v: unknown) =>
      v instanceof Date ? v.toISOString() : v === undefined ? undefined : v === null ? null : String(v);
    if (b !== undefined && norm(a) !== norm(b)) {
      const value = norm(b);
      changes[key] = value === undefined ? null : value;
    }
  }
  return changes;
}
