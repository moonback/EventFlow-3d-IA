/**
 * Plan par défaut d'une organisation : reprend fidèlement les bâtiments et le décor historiques du
 * monde 3D (entrepôt de 44 × 34 m avec portes de quai, bureaux vitrés, salle de réunion, espace détente).
 * Sert tant que l'organisation n'a pas enregistré son propre plan, et pour « revenir au plan par défaut ».
 */
import type { Opening, Prop, Room, SitePlan, Wall, WallMaterial } from "./schema";
import type { Vec2 } from "./geometry";

/** Quatre murs d'un rectangle (nord, sud, ouest, est), extrémités a → b orientées vers +x / +z. */
function rectWalls(prefix: string, center: Vec2, size: Vec2, height: number, thickness: number, material: WallMaterial): Record<"north" | "south" | "west" | "east", Wall> {
  const [cx, cz] = center;
  const x0 = cx - size[0] / 2;
  const x1 = cx + size[0] / 2;
  const z0 = cz - size[1] / 2;
  const z1 = cz + size[1] / 2;
  const w = (side: string, a: Vec2, b: Vec2): Wall => ({ id: `${prefix}-${side}`, a, b, thickness, height, material });
  return { north: w("n", [x0, z0], [x1, z0]), south: w("s", [x0, z1], [x1, z1]), west: w("w", [x0, z0], [x0, z1]), east: w("e", [x1, z0], [x1, z1]) };
}

const rectPolygon = (center: Vec2, size: Vec2): Vec2[] => {
  const [cx, cz] = center;
  const [hw, hd] = [size[0] / 2, size[1] / 2];
  return [
    [cx - hw, cz - hd],
    [cx + hw, cz - hd],
    [cx + hw, cz + hd],
    [cx - hw, cz + hd],
  ];
};

const prop = (id: string, type: Prop["type"], position: Vec2, size: Prop["size"], extra: Partial<Prop> = {}): Prop => ({ id, type, position, elevation: 0, rotationY: 0, size, ...extra });

export function defaultSitePlan(): SitePlan {
  const wh = rectWalls("wh", [0, 0], [44, 34], 7, 0.3, "cladding");
  const of = rectWalls("of", [-38, -22], [26, 20], 3.6, 0.3, "glass");
  const mr = rectWalls("mr", [-28.5, -16.5], [5, 6], 2.8, 0.06, "glass");

  const openings: Opening[] = [
    // Entrepôt : portes de quai alignées sur les quais, entrée principale à l'est, accès aux événements au sud
    { id: "wh-dock-1", wallId: wh.east.id, offset: 7, width: 4, height: 4.5, sill: 0, kind: "sectional" },
    { id: "wh-main", wallId: wh.east.id, offset: 17, width: 6, height: 4.5, sill: 0, kind: "opening" },
    { id: "wh-dock-2", wallId: wh.east.id, offset: 27, width: 4, height: 4.5, sill: 0, kind: "sectional" },
    { id: "wh-south", wallId: wh.south.id, offset: 22, width: 10, height: 4.5, sill: 0, kind: "opening" },
    // Bureaux : entrée au sud ; salle de réunion ouverte côté est
    { id: "of-entry", wallId: of.south.id, offset: 13, width: 4, height: 2.6, sill: 0, kind: "opening" },
    { id: "mr-door", wallId: mr.east.id, offset: 1.2, width: 2.4, height: 2.6, sill: 0, kind: "opening" },
  ];

  const rooms: Room[] = [
    { id: "room-warehouse", name: "Entrepôt", polygon: rectPolygon([0, 0], [44, 34]), floor: "concrete", roofHeight: 7 },
    { id: "room-office", name: "Bureaux", polygon: rectPolygon([-38, -22], [26, 20]), floor: "carpet", roofHeight: 3.6 },
    { id: "room-meeting", name: "Salle de réunion", polygon: rectPolygon([-28.5, -16.5], [5, 6]), floor: "parquet", roofHeight: null },
  ];

  const props: Prop[] = [
    // Bureau de direction (la corbeille des devis y est posée)
    prop("director-desk", "desk", [-38, -20], [5, 0.8, 2.2], { color: "#334155" }),
    ...[-39.2, -38, -36.8].map((x, i) => prop(`director-chair-${i + 1}`, "office-chair", [x, -18.2], [0.7, 1, 0.7])),
    // Espace détente
    prop("lounge-rug", "rug", [-27.5, -29.5], [4.2, 0.02, 3]),
    prop("lounge-sofa", "sofa", [-27.5, -30.85], [3, 0.9, 1.1]),
    prop("lounge-table", "coffee-table", [-27.5, -29.2], [1.4, 0.35, 0.8]),
    prop("lounge-plant", "plant", [-25.7, -30.8], [0.6, 1.7, 0.6]),
    // Plantes
    ...(
      [
        [-50.5, -31],
        [-50.5, -13],
        [-25.8, -24],
        [-31.5, -13],
        [-42, -31],
      ] as Vec2[]
    ).map((p, i) => {
      const s = i % 2 ? 0.8 : 1.1;
      return prop(`plant-${i + 1}`, "plant", p, [Math.round(0.6 * s * 100) / 100, Math.round(1.7 * s * 100) / 100, Math.round(0.6 * s * 100) / 100]);
    }),
  ];

  return { version: 1, walls: [...Object.values(wh), ...Object.values(of), ...Object.values(mr)], openings, rooms, props };
}
