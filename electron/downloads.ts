/**
 * Téléchargements (exports CSV, PDF, documents) : l'utilisateur choisit l'emplacement dans la
 * boîte de dialogue native ; aucune écriture en dehors du chemin qu'il a choisi.
 */
import { app, BrowserWindow, dialog, Notification, shell, type DownloadItem, type Session } from "electron";
import path from "node:path";
import { log } from "./logger";

/** Nom de fichier proposé, sans séparateur de chemin ni caractère interdit sous Windows. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim();
  return cleaned.slice(0, 200) || "telechargement";
}

export function installDownloads(ses: Session, opts: { isTrusted(url: string): boolean; icon(): string }) {
  ses.on("will-download", (_event, item: DownloadItem, contents) => {
    const url = item.getURL();
    // Origine de confiance uniquement (une URL blob: porte l'origine de la page qui l'a créée)
    if (!opts.isTrusted(url)) {
      log.warn(`Téléchargement refusé : ${url.slice(0, 200)}`);
      item.cancel();
      return;
    }
    const fileName = safeFileName(item.getFilename());
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const win = BrowserWindow.fromWebContents(contents.hostWebContents ?? contents) ?? BrowserWindow.getFocusedWindow() ?? undefined;
    const options = {
      title: "Enregistrer le fichier",
      defaultPath: path.join(app.getPath("downloads"), fileName),
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }, { name: "Tous les fichiers", extensions: ["*"] }] : undefined,
    };
    // Boîte de dialogue synchrone : le chemin doit être fixé pendant l'événement
    const target = win ? dialog.showSaveDialogSync(win, options) : dialog.showSaveDialogSync(options);
    if (!target) {
      item.cancel();
      return;
    }
    item.setSavePath(target);
    item.once("done", (_e, state) => {
      if (state === "completed") {
        log.info(`Téléchargement enregistré : ${path.basename(target)}`);
        if (Notification.isSupported()) {
          const n = new Notification({ title: "Téléchargement terminé", body: path.basename(target), icon: opts.icon() });
          n.on("click", () => shell.showItemInFolder(target));
          n.show();
        }
      } else if (state === "interrupted") {
        log.warn(`Téléchargement interrompu : ${path.basename(target)}`);
        dialog.showErrorBox("Téléchargement interrompu", `Le fichier « ${path.basename(target)} » n'a pas pu être enregistré (connexion perdue, disque plein ou droits insuffisants).`);
      }
    });
  });
}
