import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { UnauthorizedError } from "@/lib/errors";
import type { AuthContext } from "./context";
import { resolveSessionToken, SESSION_COOKIE } from "./session-token";
import { generateToken, hashToken } from "./tokens";

export { SESSION_COOKIE, resolveSessionToken };

export async function createSession(params: {
  userId: string;
  organizationId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3_600_000);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: params.userId,
      organizationId: params.organizationId,
      expiresAt,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Contexte de la requête courante (mis en cache pour la durée du rendu). */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const ctx = await resolveSessionToken(token);
  if (ctx) ctx.ipAddress = await clientIp();
  return ctx;
});

/** Pour les routes API : lève 401 si non authentifié. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

/** Pour les pages : redirige vers la connexion si non authentifié. */
export async function requirePageAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function revokeSession(sessionId: string) {
  await db.session.delete({ where: { id: sessionId } }).catch(() => undefined);
}

export async function revokeAllUserSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}
