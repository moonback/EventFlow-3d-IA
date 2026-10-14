/**
 * Preload sandboxé : expose `window.eventflowDesktop`, une API minimale et typée.
 * Ni ipcRenderer, ni Node.js ne sont accessibles depuis la page ; chaque appel est revérifié
 * (expéditeur et arguments) par le processus principal.
 */
import { contextBridge, ipcRenderer } from "electron";
import { IPC, type DesktopApi, type NotifyPayload } from "./types";

const api: DesktopApi = {
  isDesktop: true,
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, String(url)),
  notify: (payload: NotifyPayload) =>
    ipcRenderer.invoke(IPC.notify, { title: String(payload?.title ?? ""), body: payload?.body === undefined ? undefined : String(payload.body), link: payload?.link === undefined ? undefined : String(payload.link) }),
  assistantWsUrl: () => ipcRenderer.invoke(IPC.assistantWsUrl),
  internal: {
    getStatus: () => ipcRenderer.invoke(IPC.status),
    retry: () => ipcRenderer.invoke(IPC.retry),
    saveServerUrl: (url: string) => ipcRenderer.invoke(IPC.saveServerUrl, String(url)),
    useLocalServer: () => ipcRenderer.invoke(IPC.useLocalServer),
    openConfigFolder: () => ipcRenderer.invoke(IPC.openConfigFolder),
    openLogFolder: () => ipcRenderer.invoke(IPC.openLogFolder),
  },
};

contextBridge.exposeInMainWorld("eventflowDesktop", Object.freeze({ ...api, internal: Object.freeze({ ...api.internal }) }));
