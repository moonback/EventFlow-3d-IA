import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Charge .env.test et force DATABASE_URL vers la base de test (TEST_DATABASE_URL si défini,
 * ex. en CI). Les autres variables déjà définies ne sont pas écrasées.
 */
export function loadTestEnv() {
  const file = path.resolve(__dirname, "../../.env.test");
  const values: Record<string, string> = {};
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line);
    if (m && !line.startsWith("#")) values[m[1]!] = m[2]!;
  }
  for (const [k, v] of Object.entries(values)) {
    if (k === "DATABASE_URL") continue;
    if (process.env[k] === undefined || k === "MAIL_DRIVER" || k === "STORAGE_LOCAL_DIR") process.env[k] = v;
  }
  const url = process.env.TEST_DATABASE_URL ?? values.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL de test introuvable (.env.test)");
  // Garde-fou : les tests détruisent la base, ils ne s'exécutent que sur une base de test
  if (!/test|e2e/.test(new URL(url).pathname)) {
    throw new Error(`Refus d'exécuter les tests sur une base non dédiée aux tests : ${new URL(url).pathname}`);
  }
  process.env.DATABASE_URL = url;
}
