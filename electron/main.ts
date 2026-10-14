/**
 * Processus principal d'EventFlow Desktop : fenêtre, cycle de vie, choix du backend
 * (développement, serveur distant ou serveur Next.js local) et pages internes d'état.
 */
import { app, BrowserWindow, dialog, protocol, session, type BrowserWindowConstructorOptions } from "electron";
import path from "node:path";
import { modeLabel, paths, resolveTarget, writeConfig } from "./config";
import { installDownloads } from "./downloads";
import { registerIpc } from "./ipc";
import { initLogger, log } from "./logger";
import { buildMenu } from "./menu";
import { extendConnectSrc, INTERNAL_ORIGIN, INTERNAL_SCHEME, isTrustedUrl, normalizeServerUrl, sanitizeInAppPath } from "./policy";
import { installInternalProtocol, installSessionSecurity, installWebContentsSecurity, secureWebPreferences, type SecurityContext } from "./security";
import { startLocalServer, StartupError, waitForHealth, type LocalServerHandle } from "./server";
import { checkForUpdatesManually, initUpdater } from "./updater";
import type { ServerMode, StartupStatus } from "./types";
import { loadWindowState, trackWindowState } from "./window-state";

const APP_ID = "fr.eventflow.desktop";
/** Partition persistante dédiée : cookies de session chiffrés sur disque (fusible EnableCookieEncryption). */
const PARTITION = "persist:eventflow";
const START_PATH = "/dashboard";

app.setName("EventFlow");
app.setAppUserModelId(APP_ID);
// Profil isolé (tests automatisés, diagnostic) ; par défaut %APPDATA%\EventFlow
if (process.env.EVENTFLOW_USER_DATA_DIR) app.setPath("userData", path.resolve(process.env.EVENTFLOW_USER_DATA_DIR));
// Tous les renderers sandboxés, y compris les fenêtres secondaires
app.enableSandbox();
// Protocole des pages internes (contexte sécurisé, origine propre) — à déclarer avant "ready"
protocol.registerSchemesAsPrivileged([{ scheme: INTERNAL_SCHEME, privileges: { standard: true, secure: true } }]);

const devToolsAllowed = !app.isPackaged || process.env.EVENTFLOW_DEVTOOLS === "1";

let mainWindow: BrowserWindow | null = null;
let localServer: LocalServerHandle | null = null;
let trustedOrigin: string | null = null;
let currentMode: ServerMode = "remote";
let lastAppUrl: string | null = null;
let quitting = false;
let startGeneration = 0;
let status: StartupStatus = {
  phase: "starting",
  title: "Démarrage d'EventFlow",
  message: "Préparation de l'application…",
  mode: "unconfigured",
  logDir: "",
  configDir: "",
  canRetry: false,
};

const security: SecurityContext = {
  trustedOrigin: () => trustedOrigin,
  preload: paths.preload(),
  devToolsAllowed,
};

function childWindowOptions(): BrowserWindowConstructorOptions {
  return { width: 1100, height: 820, autoHideMenuBar: true, icon: paths.icon(), backgroundColor: "#ffffff", webPreferences: secureWebPreferences(security, PARTITION) };
}

function setStatus(next: Omit<StartupStatus, "logDir" | "configDir">) {
  status = { ...next, logDir: paths.logs(), configDir: paths.userData() };
}

async function showPage(name: "loading" | "error" | "setup") {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadURL(`${INTERNAL_ORIGIN}/${name}.html`).catch((e: unknown) => log.error(`Page interne ${name}`, e));
}

async function showError(error: unknown) {
  const e = error instanceof StartupError ? error : new StartupError("Erreur inattendue", "EventFlow n'a pas pu démarrer.", error instanceof Error ? error.message : String(error));
  log.error(`${e.title} — ${e.message}${e.detail ? ` (${e.detail})` : ""}`);
  setStatus({ phase: "error", title: e.title, message: e.message, detail: e.detail, mode: currentMode, serverUrl: trustedOrigin ?? undefined, canRetry: true });
  await showPage("error");
}

/** Résout le backend, attend qu'il soit prêt puis charge le frontend EventFlow. */
async function start() {
  const generation = ++startGeneration;
  const target = resolveTarget();
  log.info(`Démarrage (mode ${target.mode})`);

  if (target.mode === "unconfigured") {
    trustedOrigin = null;
    setStatus({ phase: "setup", title: "Configurer EventFlow", message: target.reason ?? "Indiquez l'adresse du serveur EventFlow de votre agence.", mode: "unconfigured", canRetry: false });
    await showPage("setup");
    return;
  }

  currentMode = target.mode;
  setStatus({ phase: "starting", title: "Démarrage d'EventFlow", message: target.mode === "local" ? "Démarrage du serveur local…" : "Connexion au serveur EventFlow…", mode: target.mode, canRetry: false });
  await showPage("loading");

  try {
    if (target.mode === "local") {
      if (!localServer?.alive) {
        localServer = await startLocalServer({
          preferredPort: target.port,
          onExit: (code) => {
            localServer = null;
            if (!quitting && currentMode === "local") void showError(new StartupError("Le serveur local s'est arrêté", `Le serveur EventFlow s'est arrêté (code ${code}).`, "Consultez server.log dans le dossier des journaux, puis réessayez."));
          },
        });
      }
      trustedOrigin = localServer.origin;
    } else {
      if (localServer) {
        await localServer.stop();
        localServer = null;
      }
      trustedOrigin = target.origin;
      await waitForHealth(target.origin, { timeoutMs: target.mode === "dev" ? 180_000 : 20_000 });
    }
    if (generation !== startGeneration || !mainWindow) return;
    const url = lastAppUrl && isTrustedUrl(lastAppUrl, trustedOrigin) ? lastAppUrl : trustedOrigin + START_PATH;
    log.info(`Chargement de ${new URL(url).origin}`);
    await mainWindow.loadURL(url).catch((e: unknown) => log.warn("Chargement interrompu", e));
  } catch (error) {
    if (generation !== startGeneration) return;
    if (target.mode === "remote" && error instanceof StartupError && error.title === "Serveur injoignable") {
      await showError(new StartupError("Serveur EventFlow injoignable", `Impossible de joindre ${target.origin}. EventFlow nécessite une connexion au serveur de votre agence.`, "Vérifiez votre connexion Internet ou contactez votre administrateur."));
    } else {
      await showError(error);
    }
  }
}

function openInApp(p: string) {
  const safe = sanitizeInAppPath(p);
  if (safe && trustedOrigin && mainWindow) void mainWindow.loadURL(trustedOrigin + safe);
}

function createWindow() {
  const state = loadWindowState(paths.windowState());
  mainWindow = new BrowserWindow({
    ...state.bounds,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "EventFlow",
    icon: paths.icon(),
    backgroundColor: "#0b1120",
    webPreferences: secureWebPreferences(security, PARTITION),
  });
  if (state.maximized) mainWindow.maximize();
  trackWindowState(mainWindow, paths.windowState());
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  const wc = mainWindow.webContents;
  wc.on("did-navigate", (_e, url) => {
    if (isTrustedUrl(url, trustedOrigin)) lastAppUrl = url;
  });
  wc.on("did-navigate-in-page", (_e, url, isMainFrame) => {
    if (isMainFrame && isTrustedUrl(url, trustedOrigin)) lastAppUrl = url;
  });
  wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    // -3 : navigation annulée (redirection, nouvelle navigation) — pas une panne
    if (!isMainFrame || code === -3 || !isTrustedUrl(url, trustedOrigin)) return;
    void showError(new StartupError("Connexion au serveur perdue", "La page n'a pas pu être chargée.", `${description} (${code})`));
  });
  wc.on("render-process-gone", (_e, details) => {
    if (details.reason === "clean-exit") return;
    void showError(new StartupError("La page s'est arrêtée", "Le moteur d'affichage s'est arrêté de manière inattendue.", `Raison : ${details.reason}`));
  });
  wc.on("unresponsive", () => log.warn("La fenêtre ne répond plus"));
  // Modifications non enregistrées (ex. éditeur de site 3D) : Electron n'affiche pas de dialogue lui-même
  wc.on("will-prevent-unload", (event) => {
    if (!mainWindow) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "warning",
      buttons: ["Quitter sans enregistrer", "Annuler"],
      defaultId: 1,
      cancelId: 1,
      title: "Modifications non enregistrées",
      message: "Des modifications ne sont pas enregistrées.",
      detail: "Si vous quittez cette page, elles seront perdues.",
    });
    if (choice === 0) event.preventDefault();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    initLogger(paths.logs());
    log.info(`EventFlow Desktop ${app.getVersion()} (Electron ${process.versions.electron}, ${app.isPackaged ? "packagé" : "développement"})`);

    const ses = session.fromPartition(PARTITION);
    ses.setSpellCheckerLanguages(["fr"]);
    installInternalProtocol(ses, paths.pages());
    installSessionSecurity(ses, security);
    installDownloads(ses, { isTrusted: (url) => isTrustedUrl(url, trustedOrigin), icon: paths.icon });
    // Mode local : la CSP du serveur embarqué (figée au build) n'autorise que 'self' ; on y ajoute
    // l'origine exacte de la passerelle vocale, uniquement pour les documents de l'origine de confiance.
    ses.webRequest.onHeadersReceived((details, callback) => {
      const wsUrl = currentMode === "local" ? (localServer?.assistantWsUrl ?? null) : null;
      const isDocument = details.resourceType === "mainFrame" || details.resourceType === "subFrame";
      if (!wsUrl || !isDocument || !isTrustedUrl(details.url, trustedOrigin) || !details.responseHeaders) return callback({});
      const headers = details.responseHeaders;
      const key = Object.keys(headers).find((k) => k.toLowerCase() === "content-security-policy");
      if (!key || !headers[key]) return callback({});
      const source = new URL(wsUrl).origin;
      callback({ responseHeaders: { ...headers, [key]: headers[key].map((v) => extendConnectSrc(v, source)) } });
    });
    installWebContentsSecurity(security, childWindowOptions);

    registerIpc({
      trustedOrigin: () => trustedOrigin,
      mode: () => currentMode,
      status: () => status,
      retry: () => void start(),
      saveServerUrl: (url) => {
        const normalized = normalizeServerUrl(url);
        if ("error" in normalized) return { ok: false, error: normalized.error };
        writeConfig({ mode: "remote", serverUrl: normalized.origin });
        lastAppUrl = null;
        void start();
        return { ok: true };
      },
      useLocalServer: () => {
        writeConfig({ mode: "local" });
        lastAppUrl = null;
        void start();
        return { ok: true };
      },
      openInApp,
      assistantWsUrl: () => (currentMode === "local" ? (localServer?.assistantWsUrl ?? null) : null),
      icon: paths.icon,
    });

    buildMenu({
      window: () => mainWindow,
      goHome: () => openInApp(START_PATH),
      reload: () => {
        const url = mainWindow?.webContents.getURL() ?? "";
        if (isTrustedUrl(url, trustedOrigin)) mainWindow?.webContents.reload();
        else void start();
      },
      showServerSetup: () => {
        setStatus({ phase: "setup", title: "Configurer EventFlow", message: "Choisissez le serveur EventFlow à utiliser.", mode: currentMode, serverUrl: trustedOrigin ?? undefined, canRetry: true });
        void showPage("setup");
      },
      checkForUpdates: () => void checkForUpdatesManually(mainWindow),
      devToolsAllowed,
      description: () => `Mode : ${modeLabel(currentMode)}${trustedOrigin ? ` (${trustedOrigin})` : ""}`,
    });

    createWindow();
    await start();
    void initUpdater(() => mainWindow);
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

// Arrêt propre du serveur local avant de quitter : aucun processus orphelin
app.on("before-quit", (event) => {
  quitting = true;
  if (!localServer?.alive) return;
  event.preventDefault();
  const server = localServer;
  localServer = null;
  void server.stop().finally(() => app.quit());
});

process.on("uncaughtException", (e) => log.error("Exception non gérée", e));
process.on("unhandledRejection", (e) => log.error("Promesse rejetée non gérée", e));
