import "server-only";
import { db } from "@/lib/db";
import { UnauthorizedError } from "@/lib/errors";
import { loadAuthContext, type AuthContext } from "./context";
import { hashToken } from "./tokens";

/**
 * Résolution d'une session sans dépendance à Next.js (ni `next/headers`, ni `next/navigation`) :
 * utilisable par les processus hors Next, comme la passerelle de l'assistant vocal.
 */
export const SESSION_COOKIE = "ef_session";

/** Résout une session à partir du jeton en clair (cookie). */
export async function resolveSessionToken(token: string): Promise<AuthContext | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, organizationId: true, expiresAt: true, lastSeenAt: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  try {
    const ctx = await loadAuthContext(session.userId, session.organizationId, session.id);
    // Mise à jour de l'activité au plus toutes les 5 minutes
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
      await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    return ctx;
  } catch (error) {
    if (error instanceof UnauthorizedError) return null;
    throw error;
  }
}

/** Lit le jeton de session dans un en-tête `Cookie` brut (requête d'upgrade WebSocket). */
export function sessionTokenFromCookieHeader(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }
  return null;
}
