/** Menu natif Windows (raccourcis standards : Ctrl+R, Ctrl++, Ctrl+-, Ctrl+0, F11, Alt+←/→). */
import { app, dialog, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { paths } from "./config";

export interface MenuActions {
  window(): BrowserWindow | null;
  goHome(): void;
  reload(): void;
  showServerSetup(): void;
  checkForUpdates(): void;
  devToolsAllowed: boolean;
  description(): string;
}

export function buildMenu(actions: MenuActions) {
  const wc = () => actions.window()?.webContents;
  const zoom = (delta: number | null) => {
    const contents = wc();
    if (!contents) return;
    contents.setZoomLevel(delta === null ? 0 : Math.max(-5, Math.min(5, contents.getZoomLevel() + delta)));
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: "&Fichier",
      submenu: [
        { label: "Tableau de bord", accelerator: "CmdOrCtrl+Shift+H", click: () => actions.goHome() },
        { type: "separator" },
        { label: "Configurer le serveur…", click: () => actions.showServerSetup() },
        { label: "Ouvrir le dossier des journaux", click: () => void shell.openPath(paths.logs()) },
        { type: "separator" },
        { role: "quit", label: "Quitter", accelerator: "Alt+F4" },
      ],
    },
    {
      label: "&Édition",
      submenu: [
        { role: "undo", label: "Annuler" },
        { role: "redo", label: "Rétablir" },
        { type: "separator" },
        { role: "cut", label: "Couper" },
        { role: "copy", label: "Copier" },
        { role: "paste", label: "Coller" },
        { role: "selectAll", label: "Tout sélectionner" },
      ],
    },
    {
      label: "&Affichage",
      submenu: [
        { label: "Précédent", accelerator: "Alt+Left", click: () => wc()?.navigationHistory.canGoBack() && wc()?.navigationHistory.goBack() },
        { label: "Suivant", accelerator: "Alt+Right", click: () => wc()?.navigationHistory.canGoForward() && wc()?.navigationHistory.goForward() },
        { label: "Recharger", accelerator: "CmdOrCtrl+R", click: () => actions.reload() },
        { label: "Recharger", accelerator: "F5", visible: false, acceleratorWorksWhenHidden: true, click: () => actions.reload() },
        { type: "separator" },
        { label: "Zoom avant", accelerator: "CmdOrCtrl+Plus", click: () => zoom(0.5) },
        { label: "Zoom avant", accelerator: "CmdOrCtrl+=", visible: false, acceleratorWorksWhenHidden: true, click: () => zoom(0.5) },
        { label: "Zoom arrière", accelerator: "CmdOrCtrl+-", click: () => zoom(-0.5) },
        { label: "Taille réelle", accelerator: "CmdOrCtrl+0", click: () => zoom(null) },
        { type: "separator" },
        { role: "togglefullscreen", label: "Plein écran", accelerator: "F11" },
        ...(actions.devToolsAllowed ? ([{ type: "separator" }, { role: "toggleDevTools", label: "Outils de développement", accelerator: "CmdOrCtrl+Shift+I" }] as MenuItemConstructorOptions[]) : []),
      ],
    },
    {
      label: "Fe&nêtre",
      submenu: [
        { role: "minimize", label: "Réduire" },
        {
          label: "Agrandir / restaurer",
          click: () => {
            const w = actions.window();
            if (w?.isMaximized()) w.unmaximize();
            else w?.maximize();
          },
        },
        { role: "close", label: "Fermer", accelerator: "CmdOrCtrl+W" },
      ],
    },
    {
      label: "&Aide",
      submenu: [
        { label: "Rechercher des mises à jour…", click: () => actions.checkForUpdates() },
        { type: "separator" },
        {
          label: "À propos d'EventFlow",
          click: () => {
            const w = actions.window();
            const options = { type: "info" as const, title: "À propos", message: `EventFlow Desktop ${app.getVersion()}`, detail: `${actions.description()}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}` };
            void (w ? dialog.showMessageBox(w, options) : dialog.showMessageBox(options));
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
