/**
 * Règles de sécurité et de configuration pures (sans dépendance à Electron) :
 * testables directement avec Vitest (tests/unit/electron-policy.test.ts).
 */
import path from "node:path";
import { parseEnv } from "node:util";
import type { NotifyPayload } from "./types";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Valide l'URL d'un serveur EventFlow et renvoie son origine (https obligatoire hors boucle locale). */
export function normalizeServerUrl(input: unknown): { origin: string } | { error: string } {
  if (typeof input !== "string" || input.length === 0 || input.length > 2048) return { error: "URL manquante ou trop longue" };
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { error: "URL invalide" };
  }
  if (url.username || url.password) return { error: "L'URL ne doit pas contenir d'identifiants" };
  if (url.protocol === "https:") return { origin: url.origin };
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return { origin: url.origin };
  return { error: "Seules les URL https:// sont acceptées (http:// uniquement pour localhost)" };
}

/** Vrai si `candidate` appartient exactement à l'origine de confiance (schéma, hôte et port). */
export function isTrustedUrl(candidate: string, trustedOrigin: string | null): boolean {
  if (!trustedOrigin) return false;
  try {
    return new URL(candidate).origin === trustedOrigin;
  } catch {
    return false;
  }
}

/**
 * Pages internes (chargement, erreur, configuration) servies par un protocole dédié plutôt que
 * file:// (fusible GrantFileProtocolExtraPrivileges désactivé) : eventflow-app://pages/<fichier>.
 */
export const INTERNAL_SCHEME = "eventflow-app";
export const INTERNAL_ORIGIN = `${INTERNAL_SCHEME}://pages`;
/** Seuls fichiers servis par le protocole interne, avec leur type MIME. */
export const INTERNAL_FILES: Readonly<Record<string, string>> = {
  "loading.html": "text/html; charset=utf-8",
  "error.html": "text/html; charset=utf-8",
  "setup.html": "text/html; charset=utf-8",
  "pages.css": "text/css; charset=utf-8",
  "pages.js": "text/javascript; charset=utf-8",
  "logo.png": "image/png",
};

/** Vrai si `candidate` est une page interne de l'application. */
export function isInternalPage(candidate: string): boolean {
  return resolveInternalFile(candidate) !== null;
}

/** Nom du fichier interne demandé, ou null s'il n'est pas dans la liste blanche (aucun accès disque arbitraire). */
export function resolveInternalFile(candidate: string): string | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  // Pas de comparaison d'`origin` : côté Node.js, elle vaut "null" pour un schéma non spécial
  if (url.protocol !== `${INTERNAL_SCHEME}:` || url.host !== "pages" || url.username || url.password) return null;
  const name = url.pathname.replace(/^\//, "");
  return Object.hasOwn(INTERNAL_FILES, name) ? name : null;
}

/** Liens pouvant être confiés au navigateur ou au client de messagerie du système. */
export function isSafeExternalUrl(candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || candidate.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "https:" || url.protocol === "http:") return url.hostname.length > 0;
  return url.protocol === "mailto:";
}

/** Chemin interne relatif (ex. "/events/1?tab=x") : refuse les URL absolues et protocol-relative. */
export function sanitizeInAppPath(link: unknown): string | null {
  if (typeof link !== "string" || link.length === 0 || link.length > 1024) return null;
  if (!link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return null;
  try {
    const url = new URL(link, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/** Valide la charge d'une demande de notification venant du frontend. */
export function validateNotifyPayload(input: unknown): NotifyPayload | null {
  if (!input || typeof input !== "object") return null;
  const { title, body, link } = input as Record<string, unknown>;
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) return null;
  if (body !== undefined && body !== null && (typeof body !== "string" || body.length > 1000)) return null;
  let safeLink: string | undefined;
  if (link !== undefined && link !== null) {
    const p = sanitizeInAppPath(link);
    if (!p) return null;
    safeLink = p;
  }
  return { title: title.trim(), body: typeof body === "string" ? body.slice(0, 500) : undefined, link: safeLink };
}

/** Permissions Chromium accordées à l'origine de confiance : micro (assistant vocal), presse-papiers, plein écran. */
const GRANTED_PERMISSIONS = new Set(["media", "clipboard-sanitized-write", "fullscreen"]);

/** Demande de permission (`setPermissionRequestHandler`). */
export function decidePermissionRequest(permission: string, trusted: boolean, mediaTypes: readonly string[] = []): boolean {
  if (!trusted || !GRANTED_PERMISSIONS.has(permission)) return false;
  // Micro uniquement : jamais la caméra ni la capture d'écran
  if (permission === "media") return mediaTypes.length > 0 && mediaTypes.every((t) => t === "audio");
  return true;
}

/** Vérification de permission (`setPermissionCheckHandler`). */
export function decidePermissionCheck(permission: string, trusted: boolean, mediaType?: string): boolean {
  if (!trusted || !GRANTED_PERMISSIONS.has(permission)) return false;
  if (permission === "media") return mediaType === "audio";
  return true;
}

/** Contenu d'un fichier `.env` (format dotenv) en objet clé/valeur. */
export function parseEnvFile(text: string): Record<string, string> {
  const parsed = parseEnv(text) as Record<string, string | undefined>;
  return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"));
}

/** Variables système nécessaires au fonctionnement de Node.js sous Windows (crypto, fichiers temporaires…). */
const INHERITED_SYSTEM_VARS = ["SystemRoot", "SYSTEMROOT", "windir", "WINDIR", "TEMP", "TMP", "PATH", "Path", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "ComSpec", "PATHEXT", "LANG"];

/** Variables refusées dans server.env : elles permettraient d'injecter du code dans le processus serveur. */
const FORBIDDEN_SERVER_VARS = /^(NODE_OPTIONS|NODE_PATH|NODE_REPL_EXTERNAL_MODULE|ELECTRON_.*|NODE_TLS_REJECT_UNAUTHORIZED)$/i;

/**
 * Origine du serveur local. Le serveur écoute 127.0.0.1, mais l'origine est `localhost` : le serveur
 * Next.js standalone construit les redirections du middleware avec `localhost` (indépendamment de
 * l'en-tête Host) et les cookies sont liés à l'hôte — une seule orthographe doit être utilisée.
 */
export function localServerOrigin(port: number) {
  return `http://localhost:${port}`;
}

export interface LocalServerEnvResult {
  env?: Record<string, string>;
  /** Configuration de la passerelle vocale à démarrer, ou null si l'assistant est désactivé/incomplet. */
  assistant?: AssistantConfig | null;
  warnings: string[];
  error?: string;
}

/**
 * Environnement du serveur Next.js embarqué : variables système minimales + server.env de
 * l'utilisateur + valeurs imposées (écoute sur la boucle locale, chemins dans userData).
 */
export function buildLocalServerEnv(
  userEnv: Record<string, string>,
  opts: { port: number; dataDir: string; systemEnv: Record<string, string | undefined>; /** Clé de chiffrement générée par l'application (si absente de server.env) */ encryptionKey?: string },
): LocalServerEnvResult {
  const warnings: string[] = [];
  if (!userEnv.DATABASE_URL) return { warnings, error: "DATABASE_URL est absente de server.env" };

  const env: Record<string, string> = {};
  for (const key of INHERITED_SYSTEM_VARS) {
    const value = opts.systemEnv[key];
    if (typeof value === "string") env[key] = value;
  }
  for (const [key, value] of Object.entries(userEnv)) {
    if (FORBIDDEN_SERVER_VARS.test(key)) {
      warnings.push(`${key} est ignorée (variable non autorisée pour le serveur local)`);
      continue;
    }
    env[key] = value;
  }

  const origin = localServerOrigin(opts.port);
  // Stockage local : toujours sous userData (le dossier d'installation n'est pas un emplacement de données)
  const storage = userEnv.STORAGE_LOCAL_DIR ? path.resolve(opts.dataDir, userEnv.STORAGE_LOCAL_DIR) : path.join(opts.dataDir, "storage", "uploads");
  if (env.MAIL_DRIVER === "file") {
    warnings.push('MAIL_DRIVER="file" n\'est pas pris en charge par le serveur local : e-mails désactivés (utiliser "smtp")');
    env.MAIL_DRIVER = "disabled";
  }
  env.MAIL_DRIVER ??= "disabled";
  // Secrets en base (clé API Gemini saisie dans les paramètres) : clé maîtresse fournie par l'application
  if (!env.APP_ENCRYPTION_KEY && opts.encryptionKey) env.APP_ENCRYPTION_KEY = opts.encryptionKey;
  // Clé API seule (sans GEMINI_BACKEND explicite) : Gemini API plutôt que Google Cloud (ADC rarement présent sur un poste)
  if (!userEnv.GEMINI_BACKEND && env.GEMINI_API_KEY) env.GEMINI_BACKEND = "developer";

  // Assistant vocal Eric : passerelle WebSocket embarquée (second utilityProcess) sur le port du serveur + 1.
  // Démarrée par défaut (ASSISTANT_ENABLED="false" pour s'en passer) : les identifiants Gemini peuvent
  // venir de server.env ou de la clé API saisie par l'organisation dans Paramètres → Organisation.
  const assistant = assistantConfig(env, opts.port);

  Object.assign(env, {
    NODE_ENV: "production",
    PORT: String(opts.port),
    HOSTNAME: "127.0.0.1",
    APP_URL: origin,
    STORAGE_LOCAL_DIR: storage,
    ASSISTANT_ENABLED: assistant ? "true" : "false",
    NEXT_TELEMETRY_DISABLED: "1",
  });
  return { env, assistant, warnings };
}

/**
 * Ajoute une source à la directive connect-src d'une CSP, sans toucher aux autres directives.
 * La CSP du serveur Next.js embarqué est figée au build (next.config.ts) : l'origine de la passerelle
 * vocale locale, connue seulement à l'exécution, y est ajoutée par le processus principal.
 */
export function extendConnectSrc(csp: string, source: string): string {
  const directives = csp.split(";").map((d) => d.trim()).filter(Boolean);
  const index = directives.findIndex((d) => d.toLowerCase().startsWith("connect-src"));
  if (index === -1) return [...directives, `connect-src 'self' ${source}`].join("; ");
  const tokens = directives[index]!.split(/\s+/);
  if (!tokens.includes(source)) directives[index] = [...tokens, source].join(" ");
  return directives.join("; ");
}

/** Port de la passerelle vocale pour un serveur local donné : juste après le port du serveur Next. */
export function assistantGatewayPort(serverPort: number): number {
  return serverPort + 1;
}

export interface AssistantConfig {
  /** Variables transmises au processus de la passerelle (DATABASE_URL, GEMINI_*, etc.) */
  env: Record<string, string>;
  /** Port d'écoute de la passerelle (loopback) */
  port: number;
  /** Origine autorisée pour l'upgrade WebSocket (celle de la fenêtre = serveur Next) */
  allowedOrigin: string;
  /** URL complète du WebSocket, injectée dans la CSP du serveur et exposée au renderer */
  wsUrl: string;
}

/**
 * Configuration de la passerelle vocale à partir de l'environnement déjà construit du serveur, ou
 * null si l'assistant est explicitement désactivé (ASSISTANT_ENABLED="false"). Sans identifiants
 * Gemini côté serveur, la passerelle démarre quand même : la clé de l'organisation (base) suffit.
 */
export function assistantConfig(serverEnv: Record<string, string>, serverPort: number): AssistantConfig | null {
  if (serverEnv.ASSISTANT_ENABLED === "false") return null;
  const backend = serverEnv.GEMINI_BACKEND === "developer" ? "developer" : "enterprise";

  const port = assistantGatewayPort(serverPort);
  const appOrigin = localServerOrigin(serverPort);
  const wsUrl = `ws://localhost:${port}/ws/assistant`;
  // La passerelle a besoin de la base (log d'outils, droits) et des identifiants Gemini ; elle écoute
  // la boucle locale sur son propre port et n'accepte l'upgrade que depuis l'origine de l'application.
  const env: Record<string, string> = {
    ...serverEnv,
    ASSISTANT_ENABLED: "true",
    ASSISTANT_GATEWAY_PORT: String(port),
    APP_URL: appOrigin,
    GEMINI_BACKEND: backend,
    NODE_ENV: "production",
  };
  return { env, port, allowedOrigin: appOrigin, wsUrl };
}

/** Interprétation de la réponse de GET /api/health. */
export function classifyHealth(status: number): "ready" | "database" | "error" {
  if (status === 200) return "ready";
  if (status === 503) return "database";
  return "error";
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ramène une géométrie de fenêtre enregistrée sur un écran visible (écran débranché, résolution changée). */
export function fitBoundsToDisplays(saved: Partial<Rect> | null | undefined, workAreas: readonly Rect[], fallback: { width: number; height: number }): Partial<Rect> {
  const primary = workAreas[0];
  const width = clamp(saved?.width ?? fallback.width, 960, primary ? Math.max(960, primary.width) : fallback.width);
  const height = clamp(saved?.height ?? fallback.height, 600, primary ? Math.max(600, primary.height) : fallback.height);
  if (typeof saved?.x !== "number" || typeof saved?.y !== "number") return { width, height };
  const { x, y } = saved;
  // Au moins 100 px de la barre de titre doivent rester sur un écran
  const visible = workAreas.some((a) => x + width - 100 >= a.x && x + 100 <= a.x + a.width && y >= a.y && y + 40 <= a.y + a.height);
  return visible ? { x, y, width, height } : { width, height };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}
