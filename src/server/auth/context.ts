import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { resolvePermissions, type Permission } from "@/lib/permissions";

/**
 * Contexte d'exécution d'une requête authentifiée. L'organisation provient TOUJOURS de la
 * session côté serveur (jamais d'un identifiant envoyé par le navigateur).
 */
export interface AuthContext {
  userId: string;
  sessionId: string | null;
  organizationId: string;
  role: Role;
  permissions: ReadonlySet<Permission>;
  user: { name: string; email: string };
  organization: { name: string; timezone: string; currency: string; slug: string };
  ipAddress?: string | null;
}

/** Construit le contexte à partir d'une appartenance active (utilisé par les sessions et les tests). */
export async function loadAuthContext(
  userId: string,
  organizationId: string,
  sessionId: string | null = null,
): Promise<AuthContext> {
  const membership = await db.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: {
      role: true,
      isActive: true,
      user: { select: { name: true, email: true, isActive: true } },
      organization: { select: { name: true, timezone: true, currency: true, slug: true } },
    },
  });
  if (!membership || !membership.isActive || !membership.user.isActive) {
    throw new UnauthorizedError("Accès à cette organisation refusé");
  }
  const overrides = await db.rolePermission.findMany({
    where: { organizationId, role: membership.role },
    select: { permission: true, granted: true },
  });
  return {
    userId,
    sessionId,
    organizationId,
    role: membership.role,
    permissions: resolvePermissions(membership.role, overrides),
    user: { name: membership.user.name, email: membership.user.email },
    organization: membership.organization,
  };
}

export function can(ctx: AuthContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function assertCan(ctx: AuthContext, ...permissions: Permission[]): void {
  for (const permission of permissions) {
    if (!ctx.permissions.has(permission)) {
      throw new ForbiddenError(`Permission requise : ${permission}`);
    }
  }
}
