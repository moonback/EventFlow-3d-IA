import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { BusinessRuleError, ForbiddenError, NotFoundError, RateLimitError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { assignableRoles } from "@/lib/permissions";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { getDummyHash, hashPassword, verifyPassword } from "../auth/password";
import { generateToken, hashToken } from "../auth/tokens";
import { sendMail, type MailResult } from "../mail";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 30;
const RESET_TTL_MS = 60 * 60_000;
const INVITE_TTL_MS = 7 * 24 * 3_600_000;

/**
 * Vérifie les identifiants. Limitation des tentatives par e-mail et par IP (fenêtre glissante
 * de 15 min, stockée en base pour fonctionner avec plusieurs instances).
 * Retourne l'utilisateur et l'organisation à ouvrir (la plus ancienne appartenance active).
 */
export async function authenticate(email: string, password: string, ipAddress: string | null) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [emailFailures, ipFailures] = await Promise.all([
    db.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    ipAddress
      ? db.loginAttempt.count({ where: { ipAddress, success: false, createdAt: { gte: since } } })
      : Promise.resolve(0),
  ]);
  if (emailFailures >= MAX_FAILURES_PER_EMAIL || ipFailures >= MAX_FAILURES_PER_IP) {
    throw new RateLimitError("Trop de tentatives de connexion. Réessayez dans 15 minutes.");
  }

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      memberships: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { organizationId: true },
        take: 1,
      },
    },
  });

  const ok = user ? await verifyPassword(user.passwordHash, password) : await verifyPassword(await getDummyHash(), password).then(() => false);
  const membership = user?.memberships[0];
  const success = Boolean(user && ok && user.isActive && membership);
  await db.loginAttempt.create({ data: { email, ipAddress, success } });

  if (!success || !user || !membership) {
    throw new UnauthorizedError("E-mail ou mot de passe incorrect");
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await db.auditLog.create({
    data: { organizationId: membership.organizationId, actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ipAddress },
  });
  return { userId: user.id, organizationId: membership.organizationId };
}

/**
 * Demande de réinitialisation : réponse identique que l'e-mail existe ou non (pas d'énumération).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, isActive: true, name: true } });
  if (!user || !user.isActive) return;
  // Un seul jeton actif à la fois
  await db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  const token = generateToken();
  await db.passwordResetToken.create({
    data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  const link = `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: "Réinitialisation de votre mot de passe EventFlow 3D",
    text: `Bonjour ${user.name},\n\nPour définir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("Lien de réinitialisation invalide ou expiré");
  }
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash, passwordChangedAt: new Date() } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Toutes les sessions existantes sont révoquées
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
}

export async function changePassword(ctx: AuthContext, currentPassword: string, newPassword: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new ValidationError("Mot de passe actuel incorrect", { currentPassword: ["Mot de passe incorrect"] });
  }
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({ where: { id: ctx.userId }, data: { passwordHash, passwordChangedAt: new Date() } }),
    // Révoque les autres sessions
    db.session.deleteMany({ where: { userId: ctx.userId, NOT: { id: ctx.sessionId ?? "" } } }),
  ]);
  await audit(ctx, "auth.password_changed", "User", ctx.userId);
}

export async function listMyOrganizations(userId: string) {
  return db.membership.findMany({
    where: { userId, isActive: true },
    select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Change l'organisation active de la session après vérification de l'appartenance. */
export async function switchOrganization(ctx: AuthContext, organizationId: string) {
  if (!ctx.sessionId) throw new UnauthorizedError();
  const membership = await db.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId: ctx.userId } },
    select: { isActive: true },
  });
  if (!membership?.isActive) throw new ForbiddenError("Vous n'êtes pas membre de cette organisation");
  await db.session.update({ where: { id: ctx.sessionId }, data: { organizationId } });
}

// ─── Membres & invitations ───────────────────────────────────────────────

export async function listMembers(ctx: AuthContext) {
  assertCan(ctx, "members:manage");
  const [members, invitations] = await Promise.all([
    db.membership.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, role: true, isActive: true, createdAt: true, user: { select: { id: true, name: true, email: true, lastLoginAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({
      where: { organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      isActive: m.isActive,
      createdAt: m.createdAt.toISOString(),
      user: { ...m.user, lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null },
    })),
    invitations: invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() })),
  };
}

function assertRoleAssignable(ctx: AuthContext, role: Role) {
  if (!assignableRoles(ctx.role).includes(role)) {
    throw new ForbiddenError("Vous ne pouvez pas attribuer ce rôle");
  }
}

export async function updateMemberRole(ctx: AuthContext, membershipId: string, role: Role, isActive?: boolean) {
  assertCan(ctx, "members:manage");
  assertRoleAssignable(ctx, role);
  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId: ctx.organizationId },
    select: { id: true, role: true, userId: true, isActive: true },
  });
  if (!membership) throw new NotFoundError("Membre");
  if (membership.role === "OWNER" && ctx.role !== "OWNER") throw new ForbiddenError("Seul un propriétaire peut modifier un propriétaire");
  if (membership.userId === ctx.userId) throw new BusinessRuleError("SELF_ROLE_CHANGE", "Vous ne pouvez pas modifier votre propre rôle");

  if (membership.role === "OWNER" && (role !== "OWNER" || isActive === false)) {
    const owners = await db.membership.count({ where: { organizationId: ctx.organizationId, role: "OWNER", isActive: true } });
    if (owners <= 1) throw new BusinessRuleError("LAST_OWNER", "L'organisation doit conserver au moins un propriétaire actif");
  }
  await db.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membership.id }, data: { role, isActive: isActive ?? membership.isActive } });
    if (isActive === false) {
      await tx.session.deleteMany({ where: { userId: membership.userId, organizationId: ctx.organizationId } });
    }
    await audit(ctx, "member.role_changed", "Membership", membership.id, {
      fromRole: membership.role,
      toRole: role,
      isActive: isActive ?? membership.isActive,
    }, tx);
  });
}

export async function createInvitation(ctx: AuthContext, email: string, role: Role): Promise<{ id: string; link: string; mail: MailResult }> {
  assertCan(ctx, "members:manage");
  assertRoleAssignable(ctx, role);
  const existing = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, user: { email } }, select: { id: true } });
  if (existing) throw new BusinessRuleError("ALREADY_MEMBER", "Cet utilisateur est déjà membre de l'organisation");

  const token = generateToken();
  const invitation = await db.invitation.create({
    data: {
      organizationId: ctx.organizationId,
      email,
      role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedById: ctx.userId,
    },
    select: { id: true },
  });
  await audit(ctx, "member.invited", "Invitation", invitation.id, { email, role });
  const link = `${env().APP_URL}/accept-invitation?token=${encodeURIComponent(token)}`;
  const mail = await sendMail({
    to: email,
    subject: `Invitation à rejoindre ${ctx.organization.name} sur EventFlow 3D`,
    text: `${ctx.user.name} vous invite à rejoindre ${ctx.organization.name}.\n\nAcceptez l'invitation (valable 7 jours) :\n${link}`,
  });
  return { id: invitation.id, link, mail };
}

export async function revokeInvitation(ctx: AuthContext, invitationId: string) {
  assertCan(ctx, "members:manage");
  const result = await db.invitation.updateMany({
    where: { id: invitationId, organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw new NotFoundError("Invitation");
  await audit(ctx, "member.invitation_revoked", "Invitation", invitationId);
}

export async function getInvitationByToken(token: string) {
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, organization: { select: { name: true } } },
  });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt.getTime() < Date.now()) return null;
  return inv;
}

/** Accepte une invitation : crée le compte si nécessaire, puis l'appartenance. */
export async function acceptInvitation(token: string, name: string, password: string) {
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, email: true, role: true, organizationId: true, expiresAt: true, acceptedAt: true, revokedAt: true, invitedById: true },
  });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("Invitation invalide ou expirée");
  }
  const existing = await db.user.findUnique({ where: { email: inv.email }, select: { id: true, passwordHash: true } });
  if (existing && !(await verifyPassword(existing.passwordHash, password))) {
    throw new ValidationError("Un compte existe déjà avec cet e-mail : saisissez son mot de passe actuel", {
      password: ["Mot de passe du compte existant incorrect"],
    });
  }
  const passwordHash = existing ? null : await hashPassword(password);
  return db.$transaction(async (tx) => {
    const userId =
      existing?.id ??
      (await tx.user.create({ data: { email: inv.email, name, passwordHash: passwordHash! }, select: { id: true } })).id;
    await tx.membership.upsert({
      where: { organizationId_userId: { organizationId: inv.organizationId, userId } },
      create: { organizationId: inv.organizationId, userId, role: inv.role },
      update: { role: inv.role, isActive: true },
    });
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await tx.auditLog.create({
      data: { organizationId: inv.organizationId, actorId: userId, action: "member.invitation_accepted", entityType: "Invitation", entityId: inv.id, changes: { role: inv.role } },
    });
    return { userId, organizationId: inv.organizationId };
  });
}
