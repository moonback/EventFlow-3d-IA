import { _electron as electron, expect, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { E2E_DATABASE_URL, E2E_PASSWORD } from "../e2e/constants";

export const ROOT = path.resolve(__dirname, "..", "..");
export const OWNER = "camille.laurent@demo.eventflow.local";
/** Port fixe du serveur local (electron/config.ts, DEFAULT_LOCAL_PORT). */
export const LOCAL_PORT = 41730;
export const LOCAL_ORIGIN = `http://localhost:${LOCAL_PORT}`;

export interface Launched {
  app: ElectronApplication;
  page: Page;
  userData: string;
}

/** Profil utilisateur isolé (préférences, cookies, server.env) dans le dossier temporaire. */
export function makeProfile(serverEnv: Record<string, string> | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eventflow-desktop-"));
  if (serverEnv) fs.writeFileSync(path.join(dir, "server.env"), Object.entries(serverEnv).map(([k, v]) => `${k}="${v}"`).join("\n"));
  return dir;
}

export function testServerEnv(overrides: Record<string, string> = {}) {
  return { DATABASE_URL: E2E_DATABASE_URL, STORAGE_DRIVER: "local", MAIL_DRIVER: "disabled", CRON_SECRET: "e2e-cron-secret", ...overrides };
}

/** Lance l'application (racine du dépôt : main = dist-electron/main.js) avec un environnement contrôlé. */
export async function launch(opts: { userData: string; env: Record<string, string> }): Promise<Launched> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === "string" && !/^(DATABASE_URL|APP_URL|NEXT_PUBLIC_.*|EVENTFLOW_.*)$/.test(k)) env[k] = v;
  const app = await electron.launch({
    args: [ROOT, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    cwd: ROOT,
    env: { ...env, EVENTFLOW_USER_DATA_DIR: opts.userData, EVENTFLOW_SERVER_ENV_FILE: path.join(opts.userData, "server.env"), EVENTFLOW_QUIET: "1", ...opts.env },
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  return { app, page, userData: opts.userData };
}

export async function launchLocal(userData = makeProfile(testServerEnv())) {
  const launched = await launch({ userData, env: { EVENTFLOW_SERVER_MODE: "local" } });
  // Sondage plutôt que waitForURL : la redirection /dashboard → /login interrompt la première navigation.
  // Sans session, l'application s'ouvre sur la page d'accueil (/).
  await expect.poll(() => launched.page.url(), { timeout: 100_000 }).toMatch(new RegExp(`^${LOCAL_ORIGIN.replace(/\./g, "\\.")}/(login|dashboard|$)`));
  await launched.page.waitForLoadState("load");
  return launched;
}

export async function login(page: Page, email = OWNER, password = E2E_PASSWORD) {
  if (!page.url().includes("/login")) await page.goto(`${LOCAL_ORIGIN}/login`);
  await expect.poll(() => page.url()).toContain("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");
}

/** Remplace shell.openExternal pour enregistrer les ouvertures sans lancer le navigateur du système. */
export async function recordExternalOpens(app: ElectronApplication) {
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __opened: string[] };
    g.__opened = [];
    shell.openExternal = async (url: string) => {
      g.__opened.push(url);
    };
  });
  return () => app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened);
}

export async function isPortListening(port: number) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.status > 0;
  } catch {
    return false;
  }
}

export async function expectPortClosed(port: number) {
  await expect.poll(() => isPortListening(port), { timeout: 15_000 }).toBe(false);
}
