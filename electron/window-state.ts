/** Mémorise la taille, la position et l'état agrandi de la fenêtre principale (userData). */
import { screen, type BrowserWindow } from "electron";
import fs from "node:fs";
import { fitBoundsToDisplays, type Rect } from "./policy";

interface SavedState extends Partial<Rect> {
  maximized?: boolean;
}

export function loadWindowState(file: string) {
  let saved: SavedState | null = null;
  try {
    saved = JSON.parse(fs.readFileSync(file, "utf8")) as SavedState;
  } catch {
    /* premier lancement */
  }
  const areas = screen.getAllDisplays().map((d) => d.workArea);
  const primary = screen.getPrimaryDisplay().workArea;
  const bounds = fitBoundsToDisplays(saved, [primary, ...areas], { width: Math.min(1440, primary.width), height: Math.min(900, primary.height) });
  return { bounds, maximized: saved?.maximized ?? false };
}

export function trackWindowState(win: BrowserWindow, file: string) {
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (win.isDestroyed()) return;
    const state: SavedState = { ...(win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds()), maximized: win.isMaximized() };
    try {
      fs.writeFileSync(file, JSON.stringify(state), "utf8");
    } catch {
      /* préférence non critique */
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  win.on("resize", schedule);
  win.on("move", schedule);
  win.on("close", save);
}
