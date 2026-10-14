import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { BusinessRuleError } from "@/lib/errors";

/**
 * Chiffrement des secrets stockés en base (ex. clé API Gemini d'une organisation) :
 * AES-256-GCM, clé maîtresse APP_ENCRYPTION_KEY (32 octets en base64), IV aléatoire par valeur.
 * Format stocké : "v1:<iv>:<tag>:<texte chiffré>" (base64). La valeur en clair n'est jamais journalisée.
 */
const VERSION = "v1";

function masterKey(): Buffer | null {
  const raw = env().APP_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

/** Le serveur peut-il chiffrer des secrets (clé maîtresse présente et valide) ? */
export function secretsEncryptionReady(): boolean {
  return masterKey() !== null;
}

export function encryptSecret(plain: string): string {
  const key = masterKey();
  if (!key) throw new BusinessRuleError("ENCRYPTION_KEY_MISSING", "Le serveur ne peut pas enregistrer de clé : APP_ENCRYPTION_KEY (32 octets en base64) n'est pas configurée");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** Déchiffre une valeur ; null si la clé maîtresse manque, a changé ou si la valeur est altérée. */
export function decryptSecret(stored: string): string | null {
  const key = masterKey();
  const [version, iv, tag, data] = stored.split(":");
  if (!key || version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
