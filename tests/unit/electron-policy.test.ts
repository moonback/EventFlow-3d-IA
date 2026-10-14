import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildLocalServerEnv,
  classifyHealth,
  decidePermissionCheck,
  decidePermissionRequest,
  fitBoundsToDisplays,
  isInternalPage,
  isSafeExternalUrl,
  isTrustedUrl,
  normalizeServerUrl,
  parseEnvFile,
  resolveInternalFile,
  sanitizeInAppPath,
  validateNotifyPayload,
} from "../../electron/policy";

describe("Electron — URL du serveur", () => {
  it("accepte https et réduit l'URL à son origine", () => {
    expect(normalizeServerUrl("https://erp.agence.fr/dashboard?x=1")).toEqual({ origin: "https://erp.agence.fr" });
    expect(normalizeServerUrl("  https://erp.agence.fr:8443 ")).toEqual({ origin: "https://erp.agence.fr:8443" });
  });
  it("n'accepte http que sur la boucle locale", () => {
    expect(normalizeServerUrl("http://localhost:3000")).toEqual({ origin: "http://localhost:3000" });
    expect(normalizeServerUrl("http://127.0.0.1:41730")).toEqual({ origin: "http://127.0.0.1:41730" });
    expect(normalizeServerUrl("http://erp.agence.fr")).toHaveProperty("error");
  });
  it("refuse les autres schémas, les identifiants et les valeurs invalides", () => {
    for (const bad of ["file:///C:/Windows", "javascript:alert(1)", "ftp://x.fr", "https://user:pass@erp.fr", "pas une url", "", 42, null]) {
      expect(normalizeServerUrl(bad)).toHaveProperty("error");
    }
  });
});

describe("Electron — origine de confiance", () => {
  const origin = "https://erp.agence.fr";
  it("compare schéma, hôte et port exactement", () => {
    expect(isTrustedUrl("https://erp.agence.fr/events/1", origin)).toBe(true);
    expect(isTrustedUrl("http://erp.agence.fr/events/1", origin)).toBe(false);
    expect(isTrustedUrl("https://erp.agence.fr.evil.com/", origin)).toBe(false);
    expect(isTrustedUrl("https://erp.agence.fr:444/", origin)).toBe(false);
    expect(isTrustedUrl("https://evil.com/?https://erp.agence.fr", origin)).toBe(false);
    expect(isTrustedUrl("https://erp.agence.fr/", null)).toBe(false);
    expect(isTrustedUrl("not a url", origin)).toBe(false);
    // Téléchargements générés dans la page : l'URL blob: porte l'origine de la page créatrice
    expect(isTrustedUrl("blob:https://erp.agence.fr/0b5c-41aa", origin)).toBe(true);
    expect(isTrustedUrl("blob:https://evil.com/0b5c-41aa", origin)).toBe(false);
    expect(isTrustedUrl("data:text/csv,a;b", origin)).toBe(false);
  });

  it("ne sert que les fichiers internes de la liste blanche", () => {
    expect(isInternalPage("eventflow-app://pages/error.html")).toBe(true);
    expect(resolveInternalFile("eventflow-app://pages/setup.html?x=1#y")).toBe("setup.html");
    for (const bad of [
      "eventflow-app://pages/../main.js",
      "eventflow-app://pages/%2e%2e/main.js",
      "eventflow-app://pages/preload.js",
      "eventflow-app://pages/sub/error.html",
      "eventflow-app://autre/error.html",
      "eventflow-app://u:p@pages/error.html",
      pathToFileURL(path.resolve("dist-electron", "pages", "error.html")).href,
      "https://erp.agence.fr/error.html",
      "eventflow-app://pages/constructor",
      "eventflow-app://pages/__proto__",
    ]) {
      expect(isInternalPage(bad)).toBe(false);
    }
  });
});

describe("Electron — liens externes et chemins internes", () => {
  it("n'autorise que http, https et mailto", () => {
    expect(isSafeExternalUrl("https://www.agence.fr/contact")).toBe(true);
    expect(isSafeExternalUrl("mailto:contact@agence.fr")).toBe(true);
    for (const bad of ["file:///C:/Windows/notepad.exe", "javascript:alert(1)", "ms-settings:", "smb://serveur/partage", "https://u:p@x.fr", "C:\\Windows", 3]) {
      expect(isSafeExternalUrl(bad)).toBe(false);
    }
  });
  it("n'accepte que des chemins relatifs à l'application", () => {
    expect(sanitizeInAppPath("/events/abc?tab=logistique#x")).toBe("/events/abc?tab=logistique#x");
    for (const bad of ["https://evil.com", "//evil.com/x", "/\\evil.com", "events/abc", "", null, "javascript:alert(1)"]) {
      expect(sanitizeInAppPath(bad)).toBeNull();
    }
  });
  it("valide les notifications demandées par la page", () => {
    expect(validateNotifyPayload({ title: " Départ imminent ", body: "Camion 2", link: "/logistics" })).toEqual({ title: "Départ imminent", body: "Camion 2", link: "/logistics" });
    expect(validateNotifyPayload({ title: "" })).toBeNull();
    expect(validateNotifyPayload({ title: "x".repeat(201) })).toBeNull();
    expect(validateNotifyPayload({ title: "ok", link: "https://evil.com" })).toBeNull();
    expect(validateNotifyPayload({ title: "ok", body: 12 })).toBeNull();
    expect(validateNotifyPayload("titre")).toBeNull();
  });
});

describe("Electron — permissions Chromium", () => {
  it("n'accorde le micro qu'à l'origine de confiance, jamais la caméra", () => {
    expect(decidePermissionRequest("media", true, ["audio"])).toBe(true);
    expect(decidePermissionRequest("media", true, ["audio", "video"])).toBe(false);
    expect(decidePermissionRequest("media", true, ["video"])).toBe(false);
    expect(decidePermissionRequest("media", true, [])).toBe(false);
    expect(decidePermissionRequest("media", false, ["audio"])).toBe(false);
    expect(decidePermissionCheck("media", true, "audio")).toBe(true);
    expect(decidePermissionCheck("media", true, "video")).toBe(false);
  });
  it("refuse par défaut toute autre permission", () => {
    for (const p of ["geolocation", "notifications", "midi", "openExternal", "pointerLock", "display-capture", "hid", "serial", "usb", "clipboard-read"]) {
      expect(decidePermissionRequest(p, true)).toBe(false);
      expect(decidePermissionCheck(p, true)).toBe(false);
    }
    expect(decidePermissionRequest("fullscreen", true)).toBe(true);
    expect(decidePermissionRequest("clipboard-sanitized-write", true)).toBe(true);
    expect(decidePermissionRequest("fullscreen", false)).toBe(false);
  });
});

describe("Electron — environnement du serveur local", () => {
  const dataDir = path.resolve("C:/Users/test/AppData/Roaming/EventFlow/server-data");
  const systemEnv = { SystemRoot: "C:\\Windows", PATH: "C:\\Windows", SECRET_OF_PARENT: "ne-doit-pas-fuir" };

  it("lit un fichier server.env au format dotenv", () => {
    expect(parseEnvFile('# commentaire\nDATABASE_URL="postgresql://u:p@localhost:5432/db"\nMAIL_DRIVER=smtp\n')).toEqual({ DATABASE_URL: "postgresql://u:p@localhost:5432/db", MAIL_DRIVER: "smtp" });
  });

  it("impose l'écoute locale, l'URL de l'application et les chemins de données", () => {
    const { env, warnings, error } = buildLocalServerEnv({ DATABASE_URL: "postgresql://x", HOSTNAME: "0.0.0.0", APP_URL: "https://autre.fr", PORT: "80" }, { port: 41730, dataDir, systemEnv });
    expect(error).toBeUndefined();
    expect(warnings).toEqual([]);
    expect(env).toMatchObject({ HOSTNAME: "127.0.0.1", PORT: "41730", APP_URL: "http://localhost:41730", NODE_ENV: "production", MAIL_DRIVER: "disabled", ASSISTANT_ENABLED: "false", SystemRoot: "C:\\Windows" });
    expect(env?.STORAGE_LOCAL_DIR).toBe(path.join(dataDir, "storage", "uploads"));
    expect(env).not.toHaveProperty("SECRET_OF_PARENT");
  });

  it("refuse les variables d'injection de code et signale les options non prises en charge", () => {
    const { env, warnings } = buildLocalServerEnv({ DATABASE_URL: "postgresql://x", NODE_OPTIONS: "--require evil.js", ELECTRON_RUN_AS_NODE: "1", MAIL_DRIVER: "file", ASSISTANT_ENABLED: "true", STORAGE_LOCAL_DIR: "fichiers" }, { port: 5000, dataDir, systemEnv });
    expect(env).not.toHaveProperty("NODE_OPTIONS");
    expect(env).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
    expect(env?.MAIL_DRIVER).toBe("disabled");
    expect(env?.ASSISTANT_ENABLED).toBe("false");
    expect(env?.STORAGE_LOCAL_DIR).toBe(path.join(dataDir, "fichiers"));
    expect(warnings).toHaveLength(4);
  });

  it("exige DATABASE_URL", () => {
    expect(buildLocalServerEnv({}, { port: 5000, dataDir, systemEnv }).error).toMatch(/DATABASE_URL/);
  });

  it("interprète le contrôle de santé", () => {
    expect(classifyHealth(200)).toBe("ready");
    expect(classifyHealth(503)).toBe("database");
    expect(classifyHealth(500)).toBe("error");
  });
});

describe("Electron — géométrie de la fenêtre", () => {
  const screen = [{ x: 0, y: 0, width: 1920, height: 1040 }];
  it("conserve une position visible", () => {
    expect(fitBoundsToDisplays({ x: 100, y: 50, width: 1200, height: 800 }, screen, { width: 1440, height: 900 })).toEqual({ x: 100, y: 50, width: 1200, height: 800 });
  });
  it("recentre une fenêtre restée sur un écran débranché et borne la taille", () => {
    expect(fitBoundsToDisplays({ x: 3000, y: 50, width: 5000, height: 100 }, screen, { width: 1440, height: 900 })).toEqual({ width: 1920, height: 600 });
    expect(fitBoundsToDisplays(null, screen, { width: 1440, height: 900 })).toEqual({ width: 1440, height: 900 });
  });
});
