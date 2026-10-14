import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { expectPortClosed, launch, launchLocal, LOCAL_ORIGIN, LOCAL_PORT, login, makeProfile, recordExternalOpens, testServerEnv, type Launched } from "./helpers";

/** getLastWebPreferences() existe à l'exécution mais n'est plus déclarée dans electron.d.ts. */
type LastPrefs = { getLastWebPreferences(): import("electron").WebPreferences };

test.describe.configure({ mode: "serial" });

test.describe("Application de bureau — serveur local embarqué", () => {
  let ctx: Launched;

  test.beforeAll(async () => {
    ctx = await launchLocal();
  });
  test.afterAll(async () => {
    await ctx?.app.close();
  });

  test("ouvre une fenêtre native sécurisée qui affiche le vrai frontend", async () => {
    const { app, page } = ctx;
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
    const props = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      const prefs = (win.webContents as unknown as LastPrefs).getLastWebPreferences();
      return {
        resizable: win.isResizable(),
        maximizable: win.isMaximizable(),
        minimizable: win.isMinimizable(),
        fullscreenable: win.isFullScreenable(),
        contextIsolation: prefs.contextIsolation,
        nodeIntegration: prefs.nodeIntegration,
        sandbox: prefs.sandbox,
        webviewTag: prefs.webviewTag,
        webSecurity: prefs.webSecurity,
      };
    });
    expect(props).toEqual({ resizable: true, maximizable: true, minimizable: true, fullscreenable: true, contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, webSecurity: true });
  });

  test("le renderer n'a accès ni à Node.js ni à ipcRenderer", async () => {
    const exposed = await ctx.page.evaluate(() => {
      const w = window as unknown as Record<string, unknown> & { eventflowDesktop: Record<string, unknown> & { internal: Record<string, unknown> } };
      return {
        require: typeof w.require,
        process: typeof w.process,
        module: typeof w.module,
        buffer: typeof w.Buffer,
        ipcRenderer: typeof w.ipcRenderer,
        electron: typeof w.electron,
        api: Object.keys(w.eventflowDesktop).sort(),
        internal: Object.keys(w.eventflowDesktop.internal).sort(),
        frozen: Object.isFrozen(w.eventflowDesktop),
      };
    });
    expect(exposed).toEqual({
      require: "undefined",
      process: "undefined",
      module: "undefined",
      buffer: "undefined",
      ipcRenderer: "undefined",
      electron: "undefined",
      api: ["getAppInfo", "internal", "isDesktop", "notify", "openExternal"],
      internal: ["getStatus", "openConfigFolder", "openLogFolder", "retry", "saveServerUrl", "useLocalServer"],
      frozen: true,
    });
  });

  test("contrôles IPC : canaux internes refusés, liens externes validés", async () => {
    const { app, page } = ctx;
    const opened = await recordExternalOpens(app);
    const info = await page.evaluate(() => (window as unknown as { eventflowDesktop: { getAppInfo(): Promise<unknown> } }).eventflowDesktop.getAppInfo());
    expect(info).toMatchObject({ name: "EventFlow", mode: "local", packaged: false });
    const results = await page.evaluate(async () => {
      const d = (window as unknown as { eventflowDesktop: { openExternal(u: string): Promise<{ ok: boolean }>; notify(p: unknown): Promise<{ ok: boolean }>; internal: { getStatus(): Promise<unknown>; saveServerUrl(u: string): Promise<unknown> } } }).eventflowDesktop;
      const internal = await d.internal.getStatus().then(
        () => "autorisé",
        (e: Error) => e.message,
      );
      const save = await d.internal.saveServerUrl("https://evil.example").then(
        () => "autorisé",
        (e: Error) => e.message,
      );
      return {
        internal,
        save,
        file: await d.openExternal("file:///C:/Windows/win.ini"),
        js: await d.openExternal("javascript:alert(1)"),
        https: await d.openExternal("https://www.example.com/aide"),
        badNotify: await d.notify({ title: "x", link: "https://evil.example" }),
      };
    });
    expect(results.internal).toContain("Accès refusé");
    expect(results.save).toContain("Accès refusé");
    expect(results.file.ok).toBe(false);
    expect(results.js.ok).toBe(false);
    expect(results.https.ok).toBe(true);
    expect(results.badNotify.ok).toBe(false);
    expect(await opened()).toEqual(["https://www.example.com/aide"]);
  });

  test("refuse les navigations et fenêtres vers des origines non fiables", async () => {
    const { app, page } = ctx;
    const opened = await recordExternalOpens(app);
    const before = page.url();
    await page.evaluate(() => {
      window.open("https://evil.example/popup");
      window.open("file:///C:/Windows/win.ini");
    });
    await page.evaluate(() => (window.location.href = "https://evil.example/navigation"));
    await page.waitForTimeout(1000);
    expect(page.url()).toBe(before);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    // Liens http(s) confiés au navigateur du système ; file: jamais
    expect(await opened()).toEqual(["https://evil.example/popup", "https://evil.example/navigation"]);
    // La navigation annulée reste « en attente » pour Playwright : repartir d'un chargement complet
    await page.goto(`${LOCAL_ORIGIN}/login`);
  });

  test("la page de confiance ne peut ni ouvrir ni encadrer les pages internes de configuration", async () => {
    const { app, page } = ctx;
    const before = page.url();
    await page.evaluate(() => {
      const frame = document.createElement("iframe");
      frame.src = "eventflow-app://pages/setup.html";
      document.body.appendChild(frame);
    });
    await page.evaluate(() => (window.location.href = "eventflow-app://pages/setup.html"));
    await page.waitForTimeout(1000);
    expect(page.url()).toBe(before);
    // Le cadre garde l'URL demandée, mais rien n'y est chargé (CSP de la page + frame-ancestors 'none') :
    // on vérifie l'origine réellement chargée, pas l'URL demandée
    const origins = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.mainFrame.framesInSubtree.map((f) => f.origin));
    expect(origins.some((o) => o.startsWith("eventflow-app:"))).toBe(false);
    await page.goto(`${LOCAL_ORIGIN}/login`);
  });

  test("permissions : micro pour l'origine de confiance, tout le reste refusé", async () => {
    const states = await ctx.page.evaluate(async () => {
      const q = async (name: string) => (await navigator.permissions.query({ name: name as PermissionName })).state;
      const camera = await navigator.mediaDevices.getUserMedia({ video: true }).then(
        () => "accordé",
        (e: Error) => e.name,
      );
      return { geolocation: await q("geolocation"), notifications: await q("notifications"), camera: await q("camera"), microphone: await q("microphone"), cameraRequest: camera };
    });
    expect(states.geolocation).toBe("denied");
    expect(states.notifications).toBe("denied");
    expect(states.camera).toBe("denied");
    expect(states.microphone).toBe("granted");
    expect(states.cameraRequest).not.toBe("accordé");
  });

  test("connexion, page authentifiée, navigation et appels API", async () => {
    const { app, page } = ctx;
    await login(page);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // Cookie de session dans la partition persistante dédiée (et non la session par défaut)
    const cookies = await app.evaluate(({ session }) => session.fromPartition("persist:eventflow").cookies.get({ name: "ef_session" }));
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ domain: "localhost", httpOnly: true, secure: true, sameSite: "lax", session: false });
    const api = await page.evaluate(async () => {
      const res = await fetch("/api/notifications");
      return { status: res.status, hasData: "data" in (await res.json()) };
    });
    expect(api).toEqual({ status: 200, hasData: true });
    await page.goto(`${LOCAL_ORIGIN}/events`);
    await expect(page).toHaveURL(/\/events$/);
    await page.goto(`${LOCAL_ORIGIN}/customers`);
    await expect(page).toHaveURL(/\/customers$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/events$/);
    await page.reload();
    await expect(page).toHaveURL(/\/events$/);
  });

  test("ressources 3D : modèles .glb servis et scène WebGL rendue", async () => {
    const { page } = ctx;
    const glb = await page.evaluate(async () => {
      const res = await fetch("/models/truck.glb");
      const buf = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, magic: String.fromCharCode(...buf.slice(0, 4)), size: buf.length };
    });
    expect(glb.status).toBe(200);
    expect(glb.magic).toBe("glTF");
    expect(glb.size).toBeGreaterThan(1000);
    await page.goto(`${LOCAL_ORIGIN}/world`);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  });

  test("téléchargement d'un export via la boîte de dialogue native", async () => {
    const { app, page, userData } = ctx;
    const target = path.join(userData, "export-stock.pdf");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialogSync = (() => file) as typeof dialog.showSaveDialogSync;
    }, target);
    await page.goto(`${LOCAL_ORIGIN}/inventory`);
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.href = "/api/exports/stock-pdf";
      document.body.appendChild(a);
      a.click();
    });
    await expect.poll(() => fs.existsSync(target) && fs.statSync(target).size, { timeout: 30_000 }).toBeGreaterThan(500);
    expect(fs.readFileSync(target).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("aperçu PDF de même origine ouvert dans une fenêtre secondaire sécurisée", async () => {
    const { app, page } = ctx;
    const popupPromise = app.waitForEvent("window");
    await page.evaluate(() => window.open("/api/exports/stock-pdf?inline=1", "_blank"));
    const popup = await popupPromise;
    await expect.poll(() => popup.url()).toContain("/api/exports/stock-pdf?inline=1");
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("inline=1"))!;
      const p = (win.webContents as unknown as LastPrefs).getLastWebPreferences();
      return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration };
    });
    expect(prefs).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });
    await popup.close();
  });

  test("paramètres : l'assistant Eric se configure et se désactive depuis la page Organisation", async () => {
    const { page } = ctx;
    const { DESKTOP_SHOTS } = process.env;
    await page.goto(`${LOCAL_ORIGIN}/settings/organization`);
    const card = page.locator("#assistant");
    await expect(card.getByText("Assistant vocal Eric", { exact: true })).toBeVisible();
    // Serveur local : passerelle vocale non embarquée → avertissement explicite
    await expect(card.getByText("La passerelle vocale n'est pas activée sur le serveur")).toBeVisible();
    const toggle = card.getByRole("switch", { name: "Activer l'assistant vocal Eric" });
    await expect(toggle).toBeChecked();
    await card.getByLabel("Voix").selectOption("Kore");
    await card.getByLabel("Durée maximale d'une conversation (minutes)").fill("15");
    await card.getByRole("button", { name: "Enregistrer les réglages d'Eric" }).click();
    await expect(page.getByText("Réglages d'Eric enregistrés")).toBeVisible();
    await toggle.click();
    await expect(page.getByText("Assistant Eric désactivé")).toBeVisible();
    await expect(toggle).not.toBeChecked();
    if (DESKTOP_SHOTS) await card.screenshot({ path: `${DESKTOP_SHOTS}/shot-assistant-settings.png` });
    const saved = await page.evaluate(async () => (await (await fetch("/api/settings/assistant")).json()).data);
    expect(saved).toMatchObject({ enabled: false, voice: "Kore", maxSessionMinutes: 15, serverEnabled: false });
    // Après rechargement, la page reflète l'état enregistré
    await page.reload();
    await expect(page.locator("#assistant").getByRole("switch", { name: "Activer l'assistant vocal Eric" })).not.toBeChecked();
    await expect(page.locator("#assistant").getByLabel("Voix")).toHaveValue("Kore");
    await page.locator("#assistant").getByRole("switch", { name: "Activer l'assistant vocal Eric" }).click();
    await expect(page.getByText("Assistant Eric activé")).toBeVisible();
  });

  test("déconnexion : session invalidée côté serveur", async () => {
    const { page } = ctx;
    const result = await page.evaluate(async () => {
      const logout = await fetch("/api/auth/logout", { method: "POST" });
      const after = await fetch("/api/notifications");
      return { logout: logout.status, after: after.status };
    });
    expect(result).toEqual({ logout: 200, after: 401 });
    await page.goto(`${LOCAL_ORIGIN}/dashboard`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("fermeture : le serveur local s'arrête sans processus orphelin", async () => {
    await ctx.app.close();
    await expectPortClosed(LOCAL_PORT);
  });
});

test("la session est conservée après un redémarrage de l'application", async () => {
  const userData = makeProfile(testServerEnv());
  const first = await launchLocal(userData);
  await login(first.page);
  await first.app.close();
  await expectPortClosed(LOCAL_PORT);

  const second = await launchLocal(userData);
  await second.page.waitForURL("**/dashboard");
  await second.app.close();
  await expectPortClosed(LOCAL_PORT);
});

test("base de données inaccessible : page d'erreur explicite puis arrêt propre", async () => {
  const userData = makeProfile(testServerEnv({ DATABASE_URL: "postgresql://eventflow:eventflow@127.0.0.1:5499/introuvable?connect_timeout=2" }));
  const { app, page } = await launch({ userData, env: { EVENTFLOW_SERVER_MODE: "local" } });
  await expect(page.getByRole("heading", { name: "Base de données inaccessible" })).toBeVisible({ timeout: 100_000 });
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await app.close();
  await expectPortClosed(LOCAL_PORT);
});

test("serveur distant injoignable : message hors connexion", async () => {
  const { app, page } = await launch({ userData: makeProfile(null), env: { EVENTFLOW_SERVER_MODE: "remote", EVENTFLOW_SERVER_URL: "http://127.0.0.1:9" } });
  await expect(page.getByRole("heading", { name: "Serveur EventFlow injoignable" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("nécessite une connexion")).toBeVisible();
  await app.close();
});

test("configuration : refuse une URL de serveur non sécurisée", async () => {
  const { app, page } = await launch({ userData: makeProfile(null), env: { EVENTFLOW_SERVER_MODE: "remote" } });
  await expect(page.getByRole("heading", { name: "Configurer EventFlow" })).toBeVisible();
  await page.getByLabel("Adresse du serveur").fill("http://erp.agence.fr");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Seules les URL https:// sont acceptées")).toBeVisible();
  await app.close();
});
