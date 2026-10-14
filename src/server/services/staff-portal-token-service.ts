import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { generateToken, hashToken } from "../auth/tokens";
import { sendMail, type MailResult } from "../mail";

export const PORTAL_TOKEN_TTL_MS = 30 * 86_400_000;

/** Contexte d'une requête du portail : un seul collaborateur, une seule organisation, aucun droit applicatif. */
export interface PortalContext {
  tokenId: string;
  organizationId: string;
  staffId: string;
  staffName: string;
  organization: { name: string; timezone: string };
}

/** Émet un lien d'accès au portail (les liens précédents restent valides jusqu'à révocation ou expiration). */
export async function issuePortalToken(ctx: AuthContext, staffId: string, opts: { sendEmail?: boolean } = {}): Promise<{ link: string; expiresAt: string; mail: MailResult | null }> {
  assertCan(ctx, "staff:assign");
  const staff = await db.staffMember.findFirst({ where: { id: staffId, organizationId: ctx.organizationId, isActive: true }, select: { id: true, firstName: true, email: true } });
  if (!staff) throw new NotFoundError("Collaborateur");
  const token = generateToken();
  const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_MS);
  const row = await db.staffPortalToken.create({ data: { organizationId: ctx.organizationId, staffId, tokenHash: hashToken(token), expiresAt, createdById: ctx.userId }, select: { id: true } });
  await audit(ctx, "staff.portal_link_issued", "StaffPortalToken", row.id, { staffId });
  const link = `${env().APP_URL}/portal?token=${encodeURIComponent(token)}`;
  const mail =
    opts.sendEmail !== false && staff.email
      ? await sendMail({
          to: staff.email,
          subject: `${ctx.organization.name} — vos missions sur EventFlow 3D`,
          text: `Bonjour ${staff.firstName},\n\n${ctx.organization.name} vous propose des missions. Consultez-les, acceptez ou refusez-les et indiquez vos disponibilités :\n${link}\n\nCe lien personnel est valable 30 jours. Ne le transférez pas.`,
        })
      : null;
  return { link, expiresAt: expiresAt.toISOString(), mail };
}

export async function revokePortalTokens(ctx: AuthContext, staffId: string) {
  assertCan(ctx, "staff:assign");
  const r = await db.staffPortalToken.updateMany({ where: { staffId, organizationId: ctx.organizationId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(ctx, "staff.portal_links_revoked", "StaffMember", staffId, { revoked: r.count });
  return { revoked: r.count };
}

/** Résout un jeton brut. Message volontairement générique : aucun indice sur la cause du refus. */
export async function resolvePortalToken(token: string, now = new Date()): Promise<PortalContext> {
  const invalid = new UnauthorizedError("Lien invalide ou expiré");
  if (!token || token.length > 200) throw invalid;
  const row = await db.staffPortalToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true, organizationId: true, staffId: true, expiresAt: true, revokedAt: true,
      staff: { select: { firstName: true, lastName: true, isActive: true } },
      organization: { select: { name: true, timezone: true } },
    },
  });
  if (!row || row.revokedAt || row.expiresAt <= now || !row.staff.isActive) throw invalid;
  await db.staffPortalToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  return { tokenId: row.id, organizationId: row.organizationId, staffId: row.staffId, staffName: `${row.staff.firstName} ${row.staff.lastName}`, organization: row.organization };
}
