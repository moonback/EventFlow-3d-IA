/** Script des pages internes (chargement, erreur, configuration) — compilé en pages.js. */
import type { DesktopApi } from "../types";

const desktop = (window as unknown as { eventflowDesktop?: DesktopApi }).eventflowDesktop;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

function text(id: string, value: string | undefined) {
  const el = $(id);
  if (!el) return;
  el.textContent = value ?? "";
  el.hidden = !value;
}

async function init() {
  if (!desktop) return;
  const status = await desktop.internal.getStatus();
  const page = document.body.dataset.page;
  const phaseOfPage = { loading: "starting", error: "error", setup: "setup" }[page ?? ""];
  if (status.phase === phaseOfPage) {
    text("title", status.title);
    text("message", status.message);
    text("detail", status.detail);
  }

  $("retry")?.addEventListener("click", () => void desktop.internal.retry());
  $("setup")?.addEventListener("click", () => (window.location.href = "setup.html"));
  $("logs")?.addEventListener("click", () => void desktop.internal.openLogFolder());
  $("open-config")?.addEventListener("click", () => void desktop.internal.openConfigFolder());

  const input = $<HTMLInputElement>("server-url");
  if (input && status.serverUrl && status.mode === "remote") input.value = status.serverUrl;
  const cancel = $("cancel");
  if (cancel && (status.canRetry || page === "setup") && status.mode !== "unconfigured") {
    cancel.hidden = false;
    cancel.addEventListener("click", () => void desktop.internal.retry());
  }

  $<HTMLFormElement>("remote-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await desktop.internal.saveServerUrl(input?.value ?? "");
    text("remote-error", result.ok ? "" : result.error);
  });
  $("use-local")?.addEventListener("click", async () => {
    const result = await desktop.internal.useLocalServer();
    text("local-error", result.ok ? "" : result.error);
  });
}

void init();
