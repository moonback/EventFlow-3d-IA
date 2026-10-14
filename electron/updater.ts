/**
 * Mises à jour (electron-updater, fournisseur "generic" HTTPS) — actives uniquement si le build a
 * été configuré avec EVENTFLOW_UPDATE_URL (fichier app-update.yml présent dans les ressources).
 * electron-updater vérifie l'empreinte SHA-512 de latest.yml et, sous Windows, la signature
 * Authenticode de l'installateur lorsque l'application est signée.
 */
import { app, dialog, type BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { log } from "./logger";

let enabled = false;

export function updatesConfigured() {
  return app.isPackaged && fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));
}

export function isUpdaterEnabled() {
  return enabled;
}

async function updater() {
  const { autoUpdater } = await import("electron-updater");
  return autoUpdater;
}

export async function initUpdater(getWindow: () => BrowserWindow | null) {
  if (!updatesConfigured()) {
    log.info("Mises à jour automatiques non configurées (aucune source de publication)");
    return;
  }
  enabled = true;
  const autoUpdater = await updater();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = { info: (m: unknown) => log.info("[update]", m), warn: (m: unknown) => log.warn("[update]", m), error: (m: unknown) => log.error("[update]", m), debug: () => undefined };
  autoUpdater.on("update-available", async (info) => {
    const win = getWindow();
    const options = { type: "info" as const, buttons: ["Télécharger", "Plus tard"], defaultId: 0, cancelId: 1, title: "Mise à jour disponible", message: `EventFlow ${info.version} est disponible.`, detail: "La mise à jour sera installée à la prochaine fermeture de l'application." };
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response === 0) await autoUpdater.downloadUpdate();
  });
  autoUpdater.on("update-downloaded", async (info) => {
    const win = getWindow();
    const options = { type: "info" as const, buttons: ["Redémarrer maintenant", "Plus tard"], defaultId: 0, cancelId: 1, title: "Mise à jour prête", message: `EventFlow ${info.version} a été téléchargée.` };
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (e) => log.error("[update]", e));
  void autoUpdater.checkForUpdates().catch((e: unknown) => log.warn("[update] vérification impossible", e));
}

export async function checkForUpdatesManually(win: BrowserWindow | null) {
  if (!enabled) {
    const options = { type: "info" as const, title: "Mises à jour", message: "Les mises à jour automatiques ne sont pas configurées pour cette version." };
    if (win) await dialog.showMessageBox(win, options);
    else await dialog.showMessageBox(options);
    return;
  }
  const autoUpdater = await updater();
  const result = await autoUpdater.checkForUpdates().catch((e: unknown) => {
    log.warn("[update]", e);
    return null;
  });
  if (!result?.isUpdateAvailable) {
    const options = { type: "info" as const, title: "Mises à jour", message: result ? "EventFlow est à jour." : "Impossible de vérifier les mises à jour." };
    if (win) await dialog.showMessageBox(win, options);
    else await dialog.showMessageBox(options);
  }
}
