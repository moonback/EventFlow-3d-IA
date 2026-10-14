/**
 * Canaux IPC : liste fermée, expéditeur vérifié (origine de confiance ou page interne),
 * arguments validés. Le renderer n'est jamais considéré comme fiable.
 */
import { app, BrowserWindow, ipcMain, Notification, shell, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs";
import { paths } from "./config";
import { log } from "./logger";
import { isInternalPage, isTrustedUrl, validateNotifyPayload } from "./policy";
import { openExternalSafely } from "./security";
import { IPC, type ActionResult, type AppInfo, type ServerMode, type StartupStatus } from "./types";

export interface IpcContext {
  trustedOrigin(): string | null;
  mode(): ServerMode;
  status(): StartupStatus;
  retry(): void;
  saveServerUrl(url: unknown): ActionResult;
  useLocalServer(): ActionResult;
  /** Navigue la fenêtre principale vers un chemin interne validé. */
  openInApp(path: string): void;
  /** URL WebSocket de la passerelle vocale Eric (mode local), ou null si indisponible. */
  assistantWsUrl(): string | null;
  icon(): string;
}

type Audience = "app" | "internal";

function senderUrl(event: IpcMainInvokeEvent): string {
  return event.senderFrame?.url ?? "";
}

/** Enregistre un gestionnaire n'acceptant que les cadres principaux de l'audience prévue. */
function handle<T>(ctx: IpcContext, channel: string, audience: Audience, fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => T | Promise<T>) {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    const url = senderUrl(event);
    const isMainFrame = event.senderFrame !== null && event.senderFrame === event.sender.mainFrame;
    const allowed = isMainFrame && (audience === "internal" ? isInternalPage(url) : isTrustedUrl(url, ctx.trustedOrigin()));
    if (!allowed) {
      log.warn(`IPC refusé (${channel}) depuis ${url.slice(0, 160) || "un cadre inconnu"}`);
      throw new Error("Accès refusé");
    }
    return fn(event, ...args);
  });
}

export function registerIpc(ctx: IpcContext) {
  handle<AppInfo>(ctx, IPC.appInfo, "app", () => ({ name: app.getName(), version: app.getVersion(), platform: process.platform, mode: ctx.mode(), packaged: app.isPackaged }));

  handle<ActionResult>(ctx, IPC.openExternal, "app", async (_e, url) => ((await openExternalSafely(url)) ? { ok: true } : { ok: false, error: "URL non autorisée" }));

  handle<string | null>(ctx, IPC.assistantWsUrl, "app", () => ctx.assistantWsUrl());

  handle<ActionResult>(ctx, IPC.notify, "app", (event, payload) => {
    const valid = validateNotifyPayload(payload);
    if (!valid) return { ok: false, error: "Notification invalide" };
    const win = BrowserWindow.fromWebContents(event.sender);
    // Pas de doublon : la cloche de l'application suffit lorsque la fenêtre est au premier plan
    if (win?.isFocused()) return { ok: true };
    if (!Notification.isSupported()) return { ok: false, error: "Notifications non prises en charge" };
    const n = new Notification({ title: valid.title, body: valid.body ?? "", icon: ctx.icon(), silent: false });
    n.on("click", () => {
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
      if (valid.link) ctx.openInApp(valid.link);
    });
    n.show();
    return { ok: true };
  });

  handle<StartupStatus>(ctx, IPC.status, "internal", () => ctx.status());
  handle<ActionResult>(ctx, IPC.retry, "internal", () => {
    ctx.retry();
    return { ok: true };
  });
  handle<ActionResult>(ctx, IPC.saveServerUrl, "internal", (_e, url) => ctx.saveServerUrl(url));
  handle<ActionResult>(ctx, IPC.useLocalServer, "internal", () => ctx.useLocalServer());
  handle<ActionResult>(ctx, IPC.openConfigFolder, "internal", async () => openFolder(paths.userData()));
  handle<ActionResult>(ctx, IPC.openLogFolder, "internal", async () => openFolder(paths.logs()));
}

async function openFolder(dir: string): Promise<ActionResult> {
  fs.mkdirSync(dir, { recursive: true });
  const error = await shell.openPath(dir);
  return error ? { ok: false, error } : { ok: true };
}
