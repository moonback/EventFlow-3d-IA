/**
 * Chemins et configuration de l'application de bureau.
 * - Ressources embarquées : app.asar (code Electron, pages internes) et resources/desktop-server (Next.js).
 * - Données de l'utilisateur : app.getPath("userData") (préférences, server.env, journaux, fichiers).
 * Le répertoire courant n'est jamais utilisé : il est imprévisible une fois l'application installée.
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { normalizeServerUrl } from "./policy";
import type { DesktopConfig, ServerMode } from "./types";

export const DEV_SERVER_URL = process.env.EVENTFLOW_DEV_URL ?? "http://localhost:3000";
export const DEFAULT_LOCAL_PORT = 41730;

export const paths = {
  /** Pages internes (chargement, erreur, configuration), dans app.asar une fois packagé. */
  pages: () => path.join(__dirname, "pages"),
  preload: () => path.join(__dirname, "preload.js"),
  /** Serveur Next.js standalone embarqué (hors asar : modules natifs Prisma/Argon2). */
  server: () => (app.isPackaged ? path.join(process.resourcesPath, "desktop-server") : path.join(app.getAppPath(), "build", "desktop-server")),
  icon: () => (app.isPackaged ? path.join(process.resourcesPath, "icon.png") : path.join(app.getAppPath(), "build", "icon.png")),
  userData: () => app.getPath("userData"),
  configFile: () => path.join(app.getPath("userData"), "desktop-config.json"),
  serverEnvFile: () => process.env.EVENTFLOW_SERVER_ENV_FILE ?? path.join(app.getPath("userData"), "server.env"),
  serverData: () => path.join(app.getPath("userData"), "server-data"),
  logs: () => path.join(app.getPath("userData"), "logs"),
  windowState: () => path.join(app.getPath("userData"), "window-state.json"),
};

/** Valeurs par défaut figées au build (scripts/electron/build.mjs), sans aucun secret. */
interface BundledDefaults {
  serverUrl?: string;
  mode?: "remote" | "local";
}

function readBundledDefaults(): BundledDefaults {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "defaults.json"), "utf8")) as BundledDefaults;
  } catch {
    return {};
  }
}

export function readConfig(): DesktopConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(paths.configFile(), "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const { mode, serverUrl, localPort } = raw as Record<string, unknown>;
    return {
      mode: mode === "remote" || mode === "local" ? mode : undefined,
      serverUrl: typeof serverUrl === "string" ? serverUrl : undefined,
      localPort: typeof localPort === "number" && Number.isInteger(localPort) && localPort > 1024 && localPort < 65536 ? localPort : undefined,
    };
  } catch {
    return {};
  }
}

export function writeConfig(patch: DesktopConfig) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(paths.configFile()), { recursive: true });
  fs.writeFileSync(paths.configFile(), JSON.stringify(next, null, 2), "utf8");
}

export type ResolvedTarget =
  | { mode: "dev"; origin: string }
  | { mode: "remote"; origin: string }
  | { mode: "local"; port?: number }
  | { mode: "unconfigured"; reason?: string };

/**
 * Choix du backend :
 * 1. non packagé : serveur de développement Next.js (`npm run electron:dev`) ;
 * 2. EVENTFLOW_SERVER_MODE / EVENTFLOW_SERVER_URL (diagnostic, tests) ;
 * 3. desktop-config.json de l'utilisateur ;
 * 4. valeurs par défaut du build ;
 * 5. server.env présent → serveur local ; sinon écran de configuration.
 */
export function resolveTarget(): ResolvedTarget {
  const envMode = process.env.EVENTFLOW_SERVER_MODE;
  if (!app.isPackaged && !envMode) return { mode: "dev", origin: DEV_SERVER_URL };

  const config = readConfig();
  const defaults = readBundledDefaults();
  const mode = (envMode === "local" || envMode === "remote" ? envMode : undefined) ?? config.mode ?? defaults.mode;
  const rawUrl = process.env.EVENTFLOW_SERVER_URL ?? config.serverUrl ?? defaults.serverUrl;

  if (mode === "local") return { mode: "local", port: config.localPort };
  if (mode === "remote" || (!mode && rawUrl)) {
    const normalized = normalizeServerUrl(rawUrl);
    if ("error" in normalized) return { mode: "unconfigured", reason: rawUrl ? normalized.error : undefined };
    return { mode: "remote", origin: normalized.origin };
  }
  if (fs.existsSync(paths.serverEnvFile())) return { mode: "local", port: config.localPort };
  return { mode: "unconfigured" };
}

export function modeLabel(mode: ServerMode | "unconfigured") {
  return { dev: "développement", remote: "serveur distant", local: "serveur local", unconfigured: "non configuré" }[mode];
}
