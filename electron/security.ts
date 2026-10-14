/**
 * Contrôles de sécurité appliqués à toutes les fenêtres :
 * - navigation limitée à l'origine EventFlow de confiance et aux pages internes ;
 * - fenêtres secondaires uniquement pour l'origine de confiance (aperçus PDF), liens externes
 *   validés puis confiés au navigateur du système ;
 * - permissions Chromium refusées par défaut (micro seul pour l'assistant vocal) ;
 * - aucune balise <webview>, aucun accès Node.js dans les pages.
 */
import { app, shell, type BrowserWindowConstructorOptions, type Session, type WebContents, type WebPreferences } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { log } from "./logger";
import { decidePermissionCheck, decidePermissionRequest, INTERNAL_FILES, INTERNAL_SCHEME, isInternalPage, isSafeExternalUrl, isTrustedUrl, resolveInternalFile } from "./policy";

export interface SecurityContext {
  /** Origine de confiance courante (serveur EventFlow), ou null tant qu'elle n'est pas connue. */
  trustedOrigin(): string | null;
  preload: string;
  devToolsAllowed: boolean;
}

/** Préférences communes à toutes les fenêtres : renderer isolé, sandboxé, sans Node.js. */
export function secureWebPreferences(ctx: SecurityContext, partition: string): WebPreferences {
  return {
    preload: ctx.preload,
    partition,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    // Visionneuse PDF intégrée de Chromium (aperçus de devis, fiches et documents)
    plugins: true,
    spellcheck: true,
    devTools: ctx.devToolsAllowed,
    navigateOnDragDrop: false,
    safeDialogs: true,
  };
}

/** Le contenu peut-il s'afficher dans une fenêtre de l'application ? */
export function isAllowedInApp(url: string, ctx: SecurityContext): boolean {
  return isTrustedUrl(url, ctx.trustedOrigin()) || isInternalPage(url);
}

/** Ouvre un lien dans le navigateur du système après validation (http, https, mailto). */
export async function openExternalSafely(url: unknown): Promise<boolean> {
  if (!isSafeExternalUrl(url)) {
    log.warn(`Lien externe refusé : ${String(url).slice(0, 200)}`);
    return false;
  }
  await shell.openExternal(url);
  return true;
}

const INTERNAL_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/**
 * Sert les pages internes depuis app.asar (lecture par le processus principal) : liste blanche de
 * fichiers, aucun chemin dérivé de l'URL, CSP stricte en en-tête.
 */
export function installInternalProtocol(ses: Session, pagesDir: string) {
  ses.protocol.handle(INTERNAL_SCHEME, async (request) => {
    const name = resolveInternalFile(request.url);
    if (!name) return new Response("Introuvable", { status: 404 });
    try {
      const body = await fs.readFile(path.join(pagesDir, name));
      return new Response(new Uint8Array(body), {
        headers: { "Content-Type": INTERNAL_FILES[name] ?? "application/octet-stream", "Content-Security-Policy": INTERNAL_CSP, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" },
      });
    } catch (error) {
      log.error(`Page interne illisible : ${name}`, error);
      return new Response("Erreur", { status: 500 });
    }
  });
}

export function installSessionSecurity(ses: Session, ctx: SecurityContext) {
  const trusted = (origin: string | undefined | null) => !!origin && isTrustedUrl(origin, ctx.trustedOrigin());

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || wc.getURL();
    const mediaTypes = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
    const granted = decidePermissionRequest(permission, trusted(requestingUrl), mediaTypes);
    if (!granted) log.warn(`Permission refusée : ${permission} (${requestingUrl.slice(0, 120)})`);
    callback(granted);
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    const mediaType = "mediaType" in details ? details.mediaType : undefined;
    return decidePermissionCheck(permission, trusted(requestingOrigin), mediaType);
  });
  // USB, HID, série, Bluetooth : jamais nécessaires
  ses.setDevicePermissionHandler(() => false);
  ses.on("select-hid-device", (event, _details, callback) => {
    event.preventDefault();
    callback();
  });
  ses.on("select-serial-port", (event, _ports, _wc, callback) => {
    event.preventDefault();
    callback("");
  });
  ses.on("select-usb-device", (event, _details, callback) => {
    event.preventDefault();
    callback();
  });
  // Capture d'écran refusée (aucun gestionnaire de capture enregistré)
  ses.setDisplayMediaRequestHandler((_request, callback) => callback({}));
}

/** Contrôle de chaque WebContents créé (fenêtre principale, aperçus, workers de service…). */
export function installWebContentsSecurity(ctx: SecurityContext, childWindowOptions: () => BrowserWindowConstructorOptions) {
  app.on("web-contents-created", (_event, contents: WebContents) => {
    contents.on("will-attach-webview", (event) => {
      event.preventDefault();
      log.warn("Balise <webview> refusée");
    });

    // Les pages internes ont accès aux canaux de configuration : on n'y entre que depuis une autre page
    // interne (lien « Configurer le serveur ») ou par le processus principal (loadURL, sans événement).
    const allowedFrom = (url: string) => (isInternalPage(url) ? isInternalPage(contents.getURL()) : isAllowedInApp(url, ctx));

    contents.on("will-navigate", (event) => {
      if (allowedFrom(event.url)) return;
      event.preventDefault();
      log.warn(`Navigation refusée : ${event.url.slice(0, 200)}`);
      if (!isInternalPage(event.url)) void openExternalSafely(event.url);
    });
    contents.on("will-redirect", (event) => {
      // Les redirections serveur (ex. /login?next=...) restent sur l'origine de confiance
      if (isTrustedUrl(event.url, ctx.trustedOrigin())) return;
      event.preventDefault();
      log.warn(`Redirection refusée : ${event.url.slice(0, 200)}`);
    });
    contents.on("will-frame-navigate", (event) => {
      // Sous-cadres (aperçu PDF du devis) : origine de confiance uniquement, jamais une page interne
      if (event.isMainFrame || isTrustedUrl(event.url, ctx.trustedOrigin())) return;
      event.preventDefault();
      log.warn(`Navigation de cadre refusée : ${event.url.slice(0, 200)}`);
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (isTrustedUrl(url, ctx.trustedOrigin())) return { action: "allow", overrideBrowserWindowOptions: childWindowOptions() };
      void openExternalSafely(url);
      return { action: "deny" };
    });

    if (!ctx.devToolsAllowed) {
      contents.on("devtools-opened", () => contents.closeDevTools());
    }
  });
}
