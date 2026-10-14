import { describe, expect, it } from "vitest";
import { defaultSitePlan } from "@/features/site-plan/default-plan";
import { fitOpening, nearestWall, planObstacles, pointInRect, polygonArea, snapPoint, solidIntervals, wallAngle, wallPieces, type Vec2 } from "@/features/site-plan/geometry";
import { commit, initHistory, moveWallEnd, redo, removeElements, splitWall, translateWall, undo, updateElement } from "@/features/site-plan/history";
import { sitePlanSchema, type Opening, type SitePlan, type Wall } from "@/features/site-plan/schema";

const wall = (id: string, a: Vec2, b: Vec2, extra: Partial<Wall> = {}): Wall => ({ id, a, b, thickness: 0.2, height: 3, material: "plaster", ...extra });
const opening = (id: string, wallId: string, offset: number, extra: Partial<Opening> = {}): Opening => ({ id, wallId, offset, width: 1, height: 2, sill: 0, kind: "door", ...extra });
const plan = (p: Partial<SitePlan>): SitePlan => ({ version: 1, walls: [], openings: [], rooms: [], props: [], ...p });

describe("plan par défaut", () => {
  it("est valide", () => {
    expect(sitePlanSchema.safeParse(defaultSitePlan()).success).toBe(true);
  });

  it("reproduit les murs franchissables des bâtiments historiques", () => {
    const p = defaultSitePlan();
    // Mêmes segments pleins que les bâtiments historiques : entrepôt 8 (4 à l'est, 2 au sud), bureaux 5
    const obstacles = planObstacles({ ...p, walls: p.walls.filter((w) => !w.id.startsWith("mr-")), props: [] });
    expect(obstacles).toHaveLength(13);
    // L'entrée principale de l'entrepôt (est, z = 0) reste libre, le mur à côté ne l'est pas
    expect(obstacles.some((r) => pointInRect([22, 0], r))).toBe(false);
    expect(obstacles.some((r) => pointInRect([22, 5], r))).toBe(true);
  });
});

describe("validation du plan", () => {
  it("refuse une ouverture qui dépasse de son mur ou un mur inconnu", () => {
    const w = wall("w1", [0, 0], [4, 0]);
    expect(sitePlanSchema.safeParse(plan({ walls: [w], openings: [opening("o1", "w1", 3.8)] })).success).toBe(false);
    expect(sitePlanSchema.safeParse(plan({ walls: [w], openings: [opening("o1", "nope", 2)] })).success).toBe(false);
    expect(sitePlanSchema.safeParse(plan({ walls: [w], openings: [opening("o1", "w1", 2, { sill: 2 })] })).success).toBe(false);
    expect(sitePlanSchema.safeParse(plan({ walls: [w], openings: [opening("o1", "w1", 2)] })).success).toBe(true);
  });

  it("refuse les identifiants en double, les pièces plates et les dimensions hors catalogue", () => {
    expect(sitePlanSchema.safeParse(plan({ walls: [wall("x", [0, 0], [1, 0]), wall("x", [0, 1], [1, 1])] })).success).toBe(false);
    const flat = { id: "r", name: "Plate", floor: "tiles" as const, polygon: [[0, 0], [1, 0], [2, 0]] as Vec2[] };
    expect(sitePlanSchema.safeParse(plan({ rooms: [flat] })).success).toBe(false);
    const prop = { id: "p", type: "desk" as const, position: [0, 0] as Vec2, elevation: 0, rotationY: 0, size: [40, 0.75, 0.8] as [number, number, number] };
    expect(sitePlanSchema.safeParse(plan({ props: [prop] })).success).toBe(false);
    expect(sitePlanSchema.safeParse(plan({ props: [{ ...prop, size: [1.6, 0.75, 0.8] }] })).success).toBe(true);
  });

  it("refuse des coordonnées hors du site", () => {
    expect(sitePlanSchema.safeParse(plan({ walls: [wall("w", [0, 0], [500, 0])] })).success).toBe(false);
  });
});

describe("géométrie des murs", () => {
  it("découpe un mur autour d'une fenêtre (allège, linteau, vitrage)", () => {
    const w = wall("w", [0, 0], [6, 0]);
    const pieces = wallPieces(w, [opening("f", "w", 3, { kind: "window", width: 2, height: 1, sill: 1 })]);
    expect(pieces).toEqual([
      { kind: "solid", x0: 0, x1: 2, y0: 0, y1: 3 },
      { kind: "solid", x0: 2, x1: 4, y0: 0, y1: 1 },
      { kind: "glass", x0: 2, x1: 4, y0: 1, y1: 2, opening: "window" },
      { kind: "solid", x0: 2, x1: 4, y0: 2, y1: 3 },
      { kind: "solid", x0: 4, x1: 6, y0: 0, y1: 3 },
    ]);
  });

  it("calcule les intervalles pleins et recale une ouverture dans son mur", () => {
    expect(solidIntervals(0, 10, [[2, 3], [6, 12]])).toEqual([[0, 2], [3, 6]]);
    expect(fitOpening(5, 4.9, 1)).toBe(4.5);
    expect(fitOpening(5, 0, 1)).toBe(0.5);
    expect(fitOpening(0.8, 0.4, 1)).toBeNull();
  });

  it("oriente les obstacles selon le mur et laisse passer par les portes, pas par les fenêtres", () => {
    const w = wall("w", [0, 0], [0, 10]);
    expect(wallAngle(w)).toBeCloseTo(-Math.PI / 2);
    const obstacles = planObstacles(plan({ walls: [w], openings: [opening("d", "w", 3), opening("f", "w", 7, { kind: "window", sill: 1 })] }));
    expect(obstacles.some((r) => pointInRect([0, 3], r))).toBe(false);
    expect(obstacles.some((r) => pointInRect([0, 7], r))).toBe(true);
    expect(obstacles.some((r) => pointInRect([0.5, 5], r, 0))).toBe(false);
  });

  it("trouve le mur le plus proche", () => {
    const walls = [wall("a", [0, 0], [10, 0]), wall("b", [0, 5], [10, 5])];
    expect(nearestWall(walls, [4, 4.2], 1)?.wall.id).toBe("b");
    expect(nearestWall(walls, [4, 2.5], 1)).toBeNull();
  });
});

describe("surfaces et magnétisme", () => {
  it("calcule la surface d'une pièce", () => {
    expect(polygonArea([[0, 0], [4, 0], [4, 3], [0, 3]])).toBe(12);
  });

  it("accroche aux extrémités, puis aux angles, puis à la grille", () => {
    expect(snapPoint([1.12, 0.1], { grid: 1, anchors: [[1, 0]] })).toEqual({ point: [1, 0], anchored: true });
    expect(snapPoint([3.1, 0.4], { grid: 0.5, from: [0, 0], angleStep: Math.PI / 4 }).point).toEqual([3, 0]);
    expect(snapPoint([2.26, 1.74], { grid: 0.5 }).point).toEqual([2.5, 1.5]);
  });
});

describe("opérations d'édition", () => {
  it("supprime les ouvertures avec leur mur", () => {
    const p = plan({ walls: [wall("w", [0, 0], [4, 0])], openings: [opening("o", "w", 2)] });
    expect(removeElements(p, new Set(["w"])).openings).toEqual([]);
  });

  it("entraîne les murs jointifs et recale les ouvertures", () => {
    const p = plan({ walls: [wall("a", [0, 0], [4, 0]), wall("b", [4, 0], [4, 4])], openings: [opening("o", "a", 3.4)] });
    const moved = moveWallEnd(p, "a", "b", [3, 0]);
    expect(moved.walls.find((w) => w.id === "b")!.a).toEqual([3, 0]);
    expect(moved.openings[0]!.offset).toBe(2.5);
    const shifted = translateWall(p, "b", [1, 0]);
    expect(shifted.walls.find((w) => w.id === "a")!.b).toEqual([5, 0]);
  });

  it("retire une ouverture qui ne tient plus quand le mur raccourcit", () => {
    const p = plan({ walls: [wall("a", [0, 0], [4, 0])], openings: [opening("o", "a", 2, { width: 3 })] });
    expect(updateElement(p, "walls", "a", { b: [2, 0] }).openings).toEqual([]);
  });

  it("coupe un mur en deux en répartissant les ouvertures", () => {
    const p = plan({ walls: [wall("a", [0, 0], [10, 0])], openings: [opening("o1", "a", 2), opening("o2", "a", 8)] });
    const { plan: next, ids } = splitWall(p, "a", 5);
    expect(next.walls.map((w) => [w.a, w.b])).toEqual([
      [[0, 0], [5, 0]],
      [[5, 0], [10, 0]],
    ]);
    expect(next.openings.find((o) => o.id === "o2")).toMatchObject({ wallId: ids![1], offset: 3 });
    expect(sitePlanSchema.safeParse(next).success).toBe(true);
    expect(splitWall(p, "a", 0.05).ids).toBeNull();
  });

  it("annule et rétablit", () => {
    const p0 = plan({});
    const p1 = plan({ walls: [wall("w", [0, 0], [1, 0])] });
    let h = commit(initHistory(p0), p1);
    h = undo(h);
    expect(h.present).toBe(p0);
    h = redo(h);
    expect(h.present).toBe(p1);
    expect(undo(undo(h)).present).toBe(p0);
  });
});
