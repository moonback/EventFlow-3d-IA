/**
 * Clé maîtresse du serveur local (APP_ENCRYPTION_KEY) : chiffre en base les secrets saisis dans
 * l'application (clé API Gemini de l'organisation). Générée au premier lancement, conservée dans
 * userData chiffrée par le système (safeStorage : DPAPI sous Windows, trousseau sous macOS).
 * Jamais dans l'installateur, jamais journalisée.
 */
import { safeStorage } from "electron";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { paths } from "./config";
import { log } from "./logger";

const FILE = () => path.join(paths.userData(), "encryption-key.bin");

export function localEncryptionKey(): string | undefined {
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn("Chiffrement système indisponible : aucune clé API ne pourra être enregistrée dans les paramètres");
    return undefined;
  }
  try {
    if (fs.existsSync(FILE())) {
      const key = safeStorage.decryptString(fs.readFileSync(FILE()));
      if (Buffer.from(key, "base64").length === 32) return key;
      log.warn("Clé de chiffrement locale invalide : clés API enregistrées à ressaisir");
    }
    const key = randomBytes(32).toString("base64");
    fs.mkdirSync(paths.userData(), { recursive: true });
    fs.writeFileSync(FILE(), safeStorage.encryptString(key), { mode: 0o600 });
    log.info("Clé de chiffrement locale générée");
    return key;
  } catch (error) {
    log.error("Clé de chiffrement locale illisible (profil Windows différent ?)", error instanceof Error ? error.message : String(error));
    return undefined;
  }
}
