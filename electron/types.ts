/**
 * Types partagés entre le processus principal, le preload et le frontend.
 * Aucune dépendance : déclarations et constantes uniquement (importable depuis le preload sandboxé).
 */

/** Mode d'exécution du backend. */
export type ServerMode = "dev" | "remote" | "local";

/** Configuration persistante de l'utilisateur (userData/desktop-config.json). */
export interface DesktopConfig {
  /** "remote" : serveur EventFlow distant ; "local" : serveur Next.js embarqué. */
  mode?: "remote" | "local";
  /** URL du serveur distant (https, ou http://localhost pour les essais). */
  serverUrl?: string;
  /** Port préféré du serveur local (sinon port fixe par défaut, puis port libre). */
  localPort?: number;
}

/** Informations publiques sur l'application, exposées au frontend. */
export interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  mode: ServerMode;
  packaged: boolean;
}

/** Notification native demandée par le frontend (validée par le processus principal). */
export interface NotifyPayload {
  title: string;
  body?: string;
  /** Chemin interne (ex. "/events/abc") ouvert au clic ; jamais une URL absolue. */
  link?: string;
}

/** État affiché par les pages internes (chargement, erreur, configuration). */
export interface StartupStatus {
  phase: "starting" | "error" | "setup";
  title: string;
  message: string;
  detail?: string;
  mode: ServerMode | "unconfigured";
  serverUrl?: string;
  logDir: string;
  configDir: string;
  canRetry: boolean;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** API exposée dans `window.eventflowDesktop` par le preload. */
export interface DesktopApi {
  readonly isDesktop: true;
  getAppInfo(): Promise<AppInfo>;
  /** Ouvre une URL http(s) ou mailto: dans l'application par défaut du système. */
  openExternal(url: string): Promise<ActionResult>;
  /** Notification native (affichée uniquement si la fenêtre n'a pas le focus). */
  notify(payload: NotifyPayload): Promise<ActionResult>;
  /** URL WebSocket de la passerelle vocale Eric en mode serveur local, ou null si indisponible. */
  assistantWsUrl(): Promise<string | null>;
  /** Pages internes uniquement. */
  internal: {
    getStatus(): Promise<StartupStatus>;
    retry(): Promise<ActionResult>;
    saveServerUrl(url: string): Promise<ActionResult>;
    useLocalServer(): Promise<ActionResult>;
    openConfigFolder(): Promise<ActionResult>;
    openLogFolder(): Promise<ActionResult>;
  };
}

/** Noms des canaux IPC (préfixés pour éviter toute collision). */
export const IPC = {
  appInfo: "eventflow:app-info",
  openExternal: "eventflow:open-external",
  notify: "eventflow:notify",
  assistantWsUrl: "eventflow:assistant-ws-url",
  status: "eventflow:internal:status",
  retry: "eventflow:internal:retry",
  saveServerUrl: "eventflow:internal:save-server-url",
  useLocalServer: "eventflow:internal:use-local-server",
  openConfigFolder: "eventflow:internal:open-config-folder",
  openLogFolder: "eventflow:internal:open-log-folder",
} as const;
