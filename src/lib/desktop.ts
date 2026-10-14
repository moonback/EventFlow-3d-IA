/**
 * Pont vers l'application de bureau EventFlow (Electron, voir docs/ELECTRON.md).
 * Absent dans un navigateur : toutes les fonctions sont alors sans effet.
 */
interface DesktopBridge {
  isDesktop: true;
  notify(payload: { title: string; body?: string; link?: string }): Promise<{ ok: boolean; error?: string }>;
}

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as { eventflowDesktop?: DesktopBridge }).eventflowDesktop;
  return bridge?.isDesktop === true ? bridge : null;
}

/** Notification native du système (affichée par Electron seulement si la fenêtre n'a pas le focus). */
export function notifyDesktop(payload: { title: string; body?: string | null; link?: string | null }) {
  const bridge = desktopBridge();
  if (!bridge) return;
  void bridge.notify({ title: payload.title, body: payload.body ?? undefined, link: payload.link ?? undefined }).catch(() => undefined);
}
