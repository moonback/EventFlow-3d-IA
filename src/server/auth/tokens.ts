import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Jeton opaque aléatoire (256 bits) encodé en base64url. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Seul le hash SHA-256 du jeton est stocké en base. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
