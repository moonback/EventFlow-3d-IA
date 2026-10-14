import { describe, expect, it, vi } from "vitest";
import { normalizeText, resolveSceneTarget } from "@/features/assistant/scene-targets";
import { WORLD_TOOLS, worldToolDeclarations } from "@/features/assistant/world-tools";
import type { SceneData, SceneItem } from "@/features/scene/types";
import { DATA_TOOLS } from "@/server/assistant/data-tools";
import { createWorldBridge, dayOffset, ERIC_HOME, type WorldBridgeDeps, type WorldBridgeState } from "@/three/ui/world-bridge";

const item = (kind: SceneItem["kind"], businessId: string, label: string, extra: Partial<SceneItem> = {}): SceneItem => ({
  key: `${kind}:${businessId}`,
  kind,
  businessId,
  zone: kind === "VEHICLE" ? "LOGISTICS" : kind === "EVENT" ? "EVENTS" : "WAREHOUSE",
  label,
  position: [10, 0, 5],
  rotationY: 0,
  scale: 1,
  placed: false,
  status: "ok",
  href: `/${kind.toLowerCase()}/${businessId}`,
  ...extra,
});

const ITEMS: SceneItem[] = [
  item("VEHICLE", "v1", "Renault Master", { sublabel: "AB-123-CD", status: "info" }),
  item("VEHICLE", "v2", "Iveco Daily", { sublabel: "EF-456-GH", status: "warning" }),
  item("STOCK_LOCATION", "l1", "A-03", { sublabel: "Rayonnage éclairage" }),
  item("STOCK_LOCATION", "l2", "A-01", { sublabel: "Rayonnage son" }),
  item("EVENT", "e1", "Mariage Fournier", { sublabel: "EVT-0012", status: "danger" }),
];

describe("résolution des cibles de scène", () => {
  it("accepte la clé exacte, la clé en minuscules et l'identifiant métier seul", () => {
    expect(resolveSceneTarget(ITEMS, "VEHICLE:v1")).toEqual({ item: ITEMS[0] });
    expect(resolveSceneTarget(ITEMS, "vehicle : v2")).toEqual({ item: ITEMS[1] });
    expect(resolveSceneTarget(ITEMS, "e1")).toEqual({ item: ITEMS[4] });
  });

  it("accepte le nom ou la référence, sans tenir compte des accents ni de la casse", () => {
    expect(resolveSceneTarget(ITEMS, "renault master")).toEqual({ item: ITEMS[0] });
    expect(resolveSceneTarget(ITEMS, "ab-123-cd")).toEqual({ item: ITEMS[0] });
    expect(resolveSceneTarget(ITEMS, "mariage fournier")).toEqual({ item: ITEMS[4] });
    expect(resolveSceneTarget(ITEMS, "Rayonnage eclairage")).toEqual({ item: ITEMS[2] });
    expect(normalizeText("  Événement — N°12 ")).toBe("evenement n 12");
  });

  it("signale l'ambiguïté avec des suggestions, et l'absence", () => {
    expect(resolveSceneTarget(ITEMS, "rayonnage")).toEqual({ error: "AMBIGUOUS", suggestions: ["A-03 (Rayonnage éclairage)", "A-01 (Rayonnage son)"] });
    expect(resolveSceneTarget(ITEMS, "camion de pompiers")).toEqual({ error: "UNKNOWN_OBJECT", suggestions: [] });
  });

  it("restreint aux types demandés", () => {
    expect(resolveSceneTarget(ITEMS, "e1", ["VEHICLE"])).toMatchObject({ error: "UNKNOWN_OBJECT" });
  });
});

describe("déclarations des outils « monde 3D »", () => {
  it("ont des noms uniques, distincts des outils « données », et des schémas objet", () => {
    const names = WORLD_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    const dataNames = new Set(DATA_TOOLS.map((t) => t.name));
    expect(names.filter((n) => dataNames.has(n))).toEqual([]);
    for (const d of worldToolDeclarations()) expect((d.parametersJsonSchema as { type: string }).type, d.name).toBe("object");
  });
});

describe("pont de scène", () => {
  const data = { items: ITEMS, site: { timezone: "Europe/Paris" } } as unknown as SceneData;
  const setup = (state: Partial<WorldBridgeState> = {}) => {
    const deps = {
      getState: () => ({ data, mode: "3d", overlay: null, selectedKey: null, webgl: true, walk: false, editMode: false, siteEditor: false, ...state }),
      select: vi.fn(),
      setFocus: vi.fn(),
      setHighlighted: vi.fn(),
      setMode: vi.fn(),
      setOverlay: vi.fn(),
      locate: vi.fn(async () => ({ product: "Lyre spot 200 W", locations: 3 })),
      startMeeting: vi.fn(async () => undefined),
      simulateLoading: vi.fn(async () => "Mariage Fournier"),
      moveEric: vi.fn(),
    } satisfies WorldBridgeDeps;
    return { deps, run: createWorldBridge(deps) };
  };

  it("show_object sélectionne l'objet, place Eric à côté et renvoie des faits", async () => {
    const { deps, run } = setup();
    const r = await run("show_object", { target: "Renault Master" });
    expect(r).toMatchObject({ ok: true, shown: { key: "VEHICLE:v1", label: "Renault Master", status: "info" } });
    expect(deps.select).toHaveBeenCalledWith("VEHICLE:v1");
    // Véhicule en (10, 5) : Eric à sa droite vue de la caméra, à environ 3,7 m, tourné vers lui
    const spot = deps.moveEric.mock.calls[0]![0];
    expect(spot).toMatchObject({ lookAt: [10, 1.2, 5], pointing: true });
    expect(Math.hypot(spot.position[0] - 10, spot.position[1] - 5)).toBeCloseTo(Math.hypot(3.6, 0.8), 1);
    expect(spot.position[0]).toBeGreaterThan(10);
  });

  it("ne fait rien et le dit quand la cible est inconnue ou ambiguë", async () => {
    const { deps, run } = setup();
    expect(await run("show_object", { target: "fusée" })).toMatchObject({ ok: false, error: "UNKNOWN_OBJECT" });
    expect(await run("show_object", { target: "rayonnage" })).toMatchObject({ ok: false, error: "AMBIGUOUS", suggestions: expect.any(Array) });
    expect(deps.select).not.toHaveBeenCalled();
    expect(deps.moveEric).not.toHaveBeenCalled();
  });

  it("laisse la caméra à l'utilisateur pendant la visite à pied ou l'agencement", async () => {
    for (const state of [{ walk: true }, { editMode: true }]) {
      const { deps, run } = setup(state);
      expect(await run("show_object", { target: "e1" })).toMatchObject({ ok: false, error: "UNAVAILABLE" });
      expect(await run("go_to_zone", { zone: "WAREHOUSE" })).toMatchObject({ ok: false, error: "UNAVAILABLE" });
      expect(deps.setFocus).not.toHaveBeenCalled();
    }
  });

  it("refuse tout tant que la scène n'est pas chargée ou pendant l'édition du plan", async () => {
    expect(await setup({ data: null }).run("get_scene", {})).toMatchObject({ ok: false, error: "UNAVAILABLE" });
    expect(await setup({ siteEditor: true }).run("get_scene", {})).toMatchObject({ ok: false, error: "UNAVAILABLE" });
  });

  it("go_to_zone : zone ou vue d'ensemble, Eric suit", async () => {
    const { deps, run } = setup();
    expect(await run("go_to_zone", { zone: "LOGISTICS" })).toMatchObject({ ok: true, zone: "Zone logistique", objects: 2 });
    expect(deps.setFocus).toHaveBeenCalledWith({ kind: "zone", zone: "LOGISTICS" });
    await run("go_to_zone", { zone: "OVERVIEW" });
    expect(deps.setFocus).toHaveBeenLastCalledWith({ kind: "overview" });
    expect(deps.moveEric).toHaveBeenLastCalledWith(ERIC_HOME);
  });

  it("highlight : cibles, état, effacement", async () => {
    const { deps, run } = setup();
    expect(await run("highlight", { targets: ["A-03", "inconnu"], status: "danger" })).toMatchObject({ ok: true, count: 2, notFound: ["inconnu"] });
    expect(deps.setHighlighted).toHaveBeenLastCalledWith(new Set(["STOCK_LOCATION:l1", "EVENT:e1"]));
    expect(await run("highlight", {})).toEqual({ ok: true, cleared: true });
    expect(deps.setHighlighted).toHaveBeenLastCalledWith(new Set());
  });

  it("set_view refuse la 3D sans WebGL ; show_timeline borne la date", async () => {
    expect(await setup({ webgl: false }).run("set_view", { mode: "3d" })).toMatchObject({ ok: false, error: "UNAVAILABLE" });
    const { deps, run } = setup();
    expect(await run("set_view", { mode: "plan", overlay: "none" })).toMatchObject({ ok: true, mode: "plan", overlay: "none" });
    expect(deps.setOverlay).toHaveBeenCalledWith(null);
    expect(await run("show_timeline", { date: "1999-01-01" })).toMatchObject({ ok: false, error: "INVALID_ARGUMENTS" });
  });

  it("start_meeting n'accepte qu'un événement ; simulate_loading signale l'absence de plan", async () => {
    const { deps, run } = setup();
    expect(await run("start_meeting", { event: "Renault Master" })).toMatchObject({ ok: false, error: "UNKNOWN_OBJECT" });
    expect(await run("start_meeting", { event: "Mariage Fournier" })).toEqual({ ok: true, event: "Mariage Fournier" });
    expect(deps.startMeeting).toHaveBeenCalledWith("e1");
    deps.simulateLoading.mockResolvedValueOnce(null as never);
    expect(await run("simulate_loading", { vehicle: "Iveco" })).toMatchObject({ ok: false, error: "FAILED" });
  });

  it("get_scene décrit la vue et filtre les objets", async () => {
    const r = await setup({ selectedKey: "EVENT:e1" }).run("get_scene", { kind: "VEHICLE" });
    expect(r).toMatchObject({ ok: true, total: 2, view: { mode: "3d", selected: { key: "EVENT:e1" } } });
  });

  it("calcule l'écart en jours dans le fuseau du site", () => {
    // 23:30 UTC le 14 octobre = 15 octobre à Paris
    expect(dayOffset("2026-10-16", new Date("2026-10-14T23:30:00Z"), "Europe/Paris")).toBe(1);
    expect(dayOffset("2026-10-14", new Date("2026-10-14T10:00:00Z"), "Europe/Paris")).toBe(0);
  });
});
