import { expect, test } from "@playwright/test";
import { login, trackErrors, USERS } from "./helpers";

interface SceneItem {
  key: string;
  kind: string;
  businessId: string;
  label: string;
  position: [number, number, number];
  rotationY: number;
  placed: boolean;
  map?: { missions: { vehicleKey: string; lat: number; lon: number }[] };
}
interface Scene {
  items: SceneItem[];
  counts: { locations: number; vehicles: number; events: number };
}

test.describe("Monde 3D", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.owner);
  });

  test("la scène affiche les ressources réelles du serveur et ouvre le panneau d'un objet", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const scene = (await (await page.request.get("/api/scene")).json()).data as Scene;
    expect(scene.counts.locations).toBeGreaterThan(0);
    expect(scene.counts.vehicles).toBeGreaterThan(0);
    // Chaque objet porte une identité métier explicite (type:identifiant), jamais déduite de sa position
    for (const item of scene.items) expect(item.key).toBe(`${item.kind}:${item.businessId}`);

    const rack = scene.items.find((i) => i.kind === "STOCK_LOCATION" && i.label === "B-03")!;
    expect(rack).toBeTruthy();
    await page.goto(`/world?focus=${encodeURIComponent(rack.key)}`);
    await expect(page.locator("canvas")).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText(
        `${scene.counts.locations} emplacements · ${scene.counts.vehicles} véhicules · ${scene.counts.events} événements`,
      ),
    ).toBeVisible();

    // Le panneau charge le contenu réel de l'emplacement via l'API (pas de donnée simulée)
    const panel = page.getByLabel("Panneau contextuel");
    await expect(panel.getByRole("heading", { name: "B-03" })).toBeVisible();
    const content = (
      await (await page.request.get(`/api/scene/objects/STOCK_LOCATION/${rack.businessId}`)).json()
    ).data;
    expect(JSON.stringify(content)).toContain("Chaise pliante noire");
    await expect(panel.getByText("Chaise pliante noire")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("une panne WebGL bascule sur le plan 2D sans bloquer les fonctions", async ({ page }) => {
    // Simule un navigateur sans WebGL
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error -- surcharge volontaire pour le test
      HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
        if (typeof type === "string" && type.startsWith("webgl")) return null;
        return original.apply(this, [type, ...args] as Parameters<typeof original>);
      };
    });
    const errors = trackErrors(page);
    await page.goto("/world");
    await expect(page.getByText("Mode de secours 2D")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    const plan = page.getByRole("group", { name: "Plan de l'agence (vue de dessus)" });
    await expect(plan).toBeVisible();
    await plan.getByRole("button", { name: /^B-03/ }).click();
    await expect(page.getByLabel("Panneau contextuel").getByText("Chaise pliante noire")).toBeVisible();
    // Les pages classiques restent utilisables
    await page.getByRole("link", { name: "Réservations" }).first().click();
    await expect(page).toHaveURL(/\/reservations/);
    expect(errors).toEqual([]);
  });

  test("le mode plan est accessible explicitement", async ({ page }) => {
    await page.goto("/world?mode=plan");
    await expect(page.getByRole("group", { name: "Plan de l'agence (vue de dessus)" })).toBeVisible();
    await expect(page.getByText("Mode de secours 2D")).toHaveCount(0);
  });
  test("chaque objet de la scène est atteignable au clavier et s'ouvre avec Entrée", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/world");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 60_000 });
    const objects = page.getByRole("navigation", { name: "Objets de la scène 3D" });
    const rack = objects.getByRole("button", { name: /^Emplacement B-03,/ });
    await rack.focus();
    await expect(rack).toBeFocused();
    await page.keyboard.press("Enter");
    const panel = page.getByLabel("Panneau contextuel");
    await expect(panel.getByRole("heading", { name: "B-03" })).toBeVisible();
    // La sélection est annoncée aux lecteurs d'écran
    await expect(page.getByText(/^Sélectionné : Emplacement B-03/)).toBeAttached();
    expect(errors).toEqual([]);
  });

  test("la première image 3D est rendue dans un délai raisonnable", async ({ page }) => {
    await page.goto("/world");
    await expect(page.locator("[data-first-frame=true]")).toBeAttached({ timeout: 45_000 });
    const firstFrameAt = await page.evaluate(() => (window as unknown as { __efFirstFrameAt?: number }).__efFirstFrameAt ?? Infinity);
    // Rendu logiciel (SwiftShader) en CI : le budget est volontairement large ; un GPU réel est bien plus rapide
    expect(firstFrameAt).toBeLessThan(30_000);
  });
  test("l'agencement est versionné et une version antérieure peut être restaurée", async ({ page }) => {
    const scene = (await (await page.request.get("/api/scene")).json()).data as Scene;
    const rack = scene.items.find((i) => i.kind === "STOCK_LOCATION" && i.label === "C-04")!;
    const save = await page.request.post("/api/scene/layout", {
      data: { label: "Test e2e : rotation C-04", changes: [{ kind: rack.kind, businessId: rack.businessId, label: rack.label, position: rack.position, rotationY: Math.PI / 2, scale: 1 }] },
    });
    expect(save.ok()).toBeTruthy();
    const versions = (await (await page.request.get("/api/scene/versions")).json()).data as { id: string; label: string }[];
    // La première modification sauvegarde d'abord l'état d'origine
    expect(versions[0]!.label).toBe("Test e2e : rotation C-04");
    const initial = versions.find((v) => v.label === "État initial")!;
    expect(initial).toBeTruthy();
    const rotated = (await (await page.request.get("/api/scene")).json()).data.items.find((i: SceneItem) => i.key === rack.key);
    expect(rotated.rotationY).toBeCloseTo(Math.PI / 2, 3);
    expect((await page.request.post(`/api/scene/versions/${initial.id}/restore`)).ok()).toBeTruthy();
    const restored = (await (await page.request.get("/api/scene")).json()).data.items.find((i: SceneItem) => i.key === rack.key);
    expect(restored.rotationY).toBe(rack.rotationY);
    expect(restored.placed).toBe(rack.placed);
  });

  test("les collègues connectés voient mutuellement leur point de vue, qui disparaît à leur départ", async ({ page, browser }) => {
    const other = await browser.newPage();
    await login(other, USERS.sales);
    const camera = { position: [10, 40, 60], target: [0, 0, 0], walking: false };
    const post = (p: typeof page, body: object) => p.request.post("/api/scene/presence", { data: { page: "world", camera, selectedKey: null, ...body } });
    const fromOther = (await (await post(other, {})).json()).data as { name: string }[];
    expect(fromOther.map((u) => u.name)).not.toContain("Thomas Roux"); // on ne se voit jamais soi-même
    const seen = (await (await post(page, { selectedKey: "DOCK:dock-1" })).json()).data as { name: string; camera: { target: number[] } }[];
    expect(seen.map((u) => u.name)).toContain("Thomas Roux");
    expect(seen.find((u) => u.name === "Thomas Roux")!.camera.target).toEqual([0, 0, 0]);
    // Départ de Thomas : il n'apparaît plus
    await post(other, { camera: null, leave: true });
    const after = (await (await post(page, {})).json()).data as { name: string }[];
    expect(after.map((u) => u.name)).not.toContain("Thomas Roux");
    await other.close();
  });

  test("la scène expose la carte des missions et le plan de chargement du véhicule en mission", async ({ page }) => {
    const scene = (await (await page.request.get("/api/scene")).json()).data as Scene;
    const map = scene.items.find((i) => i.kind === "MISSION_MAP")!;
    expect(map.map!.missions.length).toBeGreaterThan(0);
    for (const m of map.map!.missions) {
      // Positions en France métropolitaine
      expect(m.lat).toBeGreaterThan(41);
      expect(m.lat).toBeLessThan(52);
    }
    const vehicle = scene.items.find((i) => i.key === map.map!.missions[0]!.vehicleKey)!;
    const panel = (await (await page.request.get(`/api/scene/objects/VEHICLE/${vehicle.businessId}`)).json()).data as { loadingPlan: { steps: { step: number }[] } | null };
    expect(panel.loadingPlan?.steps.length).toBeGreaterThan(0);
    expect(panel.loadingPlan!.steps.map((s) => s.step)).toEqual(panel.loadingPlan!.steps.map((_, i) => i + 1));
  });

  test("le bureau expose la réunion, le courrier des devis, les créances et l'état des postes", async ({ page }) => {
    type Office = SceneItem & { meeting?: { events: { id: string }[] }; mailbox?: { followUps: number }; safe?: { overdueCount: number }; desk?: { state: string }; chart?: { values: number[] } };
    const items = ((await (await page.request.get("/api/scene")).json()).data as { items: Office[] }).items;
    const table = items.find((i) => i.kind === "MEETING_TABLE")!;
    expect(table.meeting!.events.length).toBeGreaterThan(0);
    expect(items.find((i) => i.kind === "QUOTE_MAILBOX")!.mailbox).toBeTruthy();
    expect(items.find((i) => i.kind === "INVOICE_SAFE")!.safe).toBeTruthy();
    for (const d of items.filter((i) => i.kind === "STAFF_DESK")) expect(["available", "mission", "leave"]).toContain(d.desk!.state);
    expect(items.find((i) => i.key === "KPI_SCREEN:office-finance")!.chart!.values).toHaveLength(6);
    // Dossier de réunion d'un événement
    const panel = (await (await page.request.get(`/api/scene/objects/EVENT/${table.meeting!.events[0]!.id}`)).json()).data as { briefing: { team: unknown[]; equipment: { units: number }; budget: unknown } };
    expect(panel.briefing.equipment.units).toBeGreaterThanOrEqual(0);
    expect(panel.briefing.budget).toBeTruthy();
  });

  test("un point de vue enregistré est partagé avec l'équipe et seul son auteur (ou l'agencement) peut le supprimer", async ({ page, browser }) => {
    const created = await page.request.post("/api/scene/bookmarks", { data: { name: "Quai 2 (e2e)", position: [30, 12, 8], target: [28, 0, 0] } });
    expect(created.ok()).toBeTruthy();
    const id = ((await created.json()).data as { id: string }).id;
    const other = await browser.newPage();
    await login(other, USERS.readonly);
    const seen = ((await (await other.request.get("/api/scene/bookmarks")).json()).data as { id: string; name: string; canDelete: boolean }[]).find((b) => b.id === id)!;
    expect(seen.name).toBe("Quai 2 (e2e)");
    expect(seen.canDelete).toBe(false);
    expect((await other.request.delete(`/api/scene/bookmarks/${id}`)).status()).toBe(403);
    await other.close();
    expect((await page.request.delete(`/api/scene/bookmarks/${id}`)).ok()).toBeTruthy();
    // Le lien partageable rouvre la scène sur ce point de vue
    await page.goto("/world?view=30,12,8,28,0,0");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 60_000 });
  });

});
