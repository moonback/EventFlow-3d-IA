import "server-only";
import type { Role } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { BusinessRuleError, ValidationError } from "@/lib/errors";
import { DEFAULT_ROLE_PERMISSIONS, isPermission, PERMISSIONS } from "@/lib/permissions";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { decimalString } from "@/lib/serialize";
import type { assistantSettingsSchema, organizationSettingsSchema } from "@/features/settings/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";

export async function getOrganizationSettings(ctx: AuthContext) {
  const o = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: {
      id: true, name: true, slug: true, legalName: true, siret: true, vatNumber: true, email: true, phone: true, addressLine1: true, addressLine2: true, postalCode: true, city: true, country: true,
      timezone: true, currency: true, defaultVatRate: true, paymentTermDays: true, prepBufferHours: true, returnBufferHours: true, quoteValidityDays: true,
      quoteFooter: true, invoiceFooter: true, latePenaltyText: true, accentColor: true, isDemo: true, publicRequestFormEnabled: true,
    },
  });
  return { ...o, defaultVatRate: decimalString(o.defaultVatRate)! };
}

export async function updateOrganizationSettings(ctx: AuthContext, data: z.output<typeof organizationSettingsSchema>) {
  assertCan(ctx, "settings:manage");
  await db.organization.update({ where: { id: ctx.organizationId }, data });
  await audit(ctx, "settings.updated", "Organization", ctx.organizationId, { fields: Object.keys(data) });
}

/**
 * Réglages de l'assistant vocal Eric. `serverEnabled` : la passerelle est activée côté serveur
 * (ASSISTANT_ENABLED) — sans elle, le réglage de l'organisation est conservé mais sans effet.
 */
export async function getAssistantSettings(ctx: AuthContext) {
  assertCan(ctx, "settings:manage");
  const o = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { assistantEnabled: true, assistantVoice: true, assistantMaxSessionMinutes: true },
  });
  const e = env();
  return {
    enabled: o.assistantEnabled,
    voice: o.assistantVoice,
    maxSessionMinutes: o.assistantMaxSessionMinutes,
    serverEnabled: e.ASSISTANT_ENABLED === "true",
    serverMaxSessionMinutes: e.ASSISTANT_MAX_SESSION_MINUTES,
  };
}

export async function updateAssistantSettings(ctx: AuthContext, data: z.output<typeof assistantSettingsSchema>) {
  assertCan(ctx, "settings:manage");
  await db.organization.update({
    where: { id: ctx.organizationId },
    data: { assistantEnabled: data.enabled, assistantVoice: data.voice, assistantMaxSessionMinutes: data.maxSessionMinutes },
  });
  await audit(ctx, "settings.assistant_updated", "Organization", ctx.organizationId, { enabled: data.enabled, voice: data.voice, maxSessionMinutes: data.maxSessionMinutes });
  return getAssistantSettings(ctx);
}

export async function getPermissionMatrix(ctx: AuthContext) {
  assertCan(ctx, "members:manage");
  const overrides = await db.rolePermission.findMany({ where: { organizationId: ctx.organizationId }, select: { role: true, permission: true, granted: true } });
  const roles = (Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[]).filter((r) => r !== "OWNER");
  return {
    roles,
    permissions: [...PERMISSIONS],
    cells: roles.flatMap((role) =>
      PERMISSIONS.map((permission) => {
        const def = DEFAULT_ROLE_PERMISSIONS[role].includes(permission);
        const o = overrides.find((x) => x.role === role && x.permission === permission);
        return { role, permission, default: def, granted: o ? o.granted : def, overridden: Boolean(o) };
      }),
    ),
  };
}

/** Modifie la matrice d'un rôle (journalisé). Le rôle Propriétaire n'est pas modifiable. */
export async function setRolePermission(ctx: AuthContext, role: Exclude<Role, "OWNER">, permission: string, granted: boolean | null) {
  assertCan(ctx, "members:manage");
  if (!isPermission(permission)) throw new ValidationError("Permission inconnue");
  if (role === "ADMIN" && ctx.role !== "OWNER") throw new BusinessRuleError("OWNER_ONLY", "Seul un propriétaire peut modifier les droits des administrateurs");
  if (granted === null || granted === DEFAULT_ROLE_PERMISSIONS[role].includes(permission)) {
    await db.rolePermission.deleteMany({ where: { organizationId: ctx.organizationId, role, permission } });
  } else {
    await db.rolePermission.upsert({
      where: { organizationId_role_permission: { organizationId: ctx.organizationId, role, permission } },
      create: { organizationId: ctx.organizationId, role, permission, granted },
      update: { granted },
    });
  }
  await audit(ctx, "permissions.changed", "RolePermission", null, { role, permission, granted: granted === null ? "default" : String(granted) });
}

export async function listAuditLog(ctx: AuthContext, query: ListQuery & { entityType?: string; actorId?: string }) {
  assertCan(ctx, "audit:read");
  const where = {
    organizationId: ctx.organizationId,
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.q ? { action: { contains: query.q, mode: "insensitive" as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...paginationArgs(query), select: { id: true, action: true, entityType: true, entityId: true, changes: true, ipAddress: true, createdAt: true, actor: { select: { name: true, email: true } } } }),
    db.auditLog.count({ where }),
  ]);
  return paginated(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), changes: r.changes as Record<string, unknown> | null })), total, query);
}

export async function memberUserOptions(ctx: AuthContext) {
  const rows = await db.membership.findMany({ where: { organizationId: ctx.organizationId, isActive: true }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } });
  return rows.map((r) => ({ value: r.user.id, label: r.user.name }));
}
