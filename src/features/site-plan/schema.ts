/**
 * Plan du site d'une organisation : murs, ouvertures, pièces et accessoires (document JSON unique).
 * Repère de la scène 3D : mètres, x vers l'est, z vers le sud. Schéma partagé serveur/client.
 */
import { z } from "zod";
import { PROP_CATALOG, PROP_TYPES } from "./catalog";
import { polygonArea, wallLength } from "./geometry";

export const WALL_MATERIALS = { plaster: "Plâtre", concrete: "Béton", brick: "Brique", cladding: "Bardage métallique", glass: "Vitrage" } as const;
export const OPENING_KINDS = { door: "Porte", "double-door": "Porte double", sectional: "Porte sectionnelle", window: "Fenêtre", opening: "Passage libre" } as const;
export const FLOOR_KINDS = { concrete: "Béton", epoxy: "Résine époxy", tiles: "Carrelage", parquet: "Parquet", carpet: "Moquette" } as const;

export const LIMITS = { coord: 150, walls: 2000, openings: 2000, rooms: 500, props: 3000, polygon: 64 } as const;

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Identifiant invalide");
const coord = z.number().finite().min(-LIMITS.coord).max(LIMITS.coord);
const point = z.tuple([coord, coord]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide");

export const wallSchema = z.object({
  id,
  a: point,
  b: point,
  thickness: z.number().min(0.05).max(1.5),
  height: z.number().min(0.5).max(20),
  material: z.enum(keys(WALL_MATERIALS)),
});

export const openingSchema = z.object({
  id,
  wallId: id,
  offset: z.number().finite().min(0),
  width: z.number().min(0.3).max(20),
  height: z.number().min(0.3).max(20),
  sill: z.number().min(0).max(10),
  kind: z.enum(keys(OPENING_KINDS)),
});

export const roomSchema = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  polygon: z.array(point).min(3).max(LIMITS.polygon),
  floor: z.enum(keys(FLOOR_KINDS)),
  roofHeight: z.number().min(1).max(25).nullable().optional(),
});

export const propSchema = z.object({
  id,
  type: z.enum(PROP_TYPES),
  position: point,
  elevation: z.number().min(0).max(20),
  rotationY: z.number().finite(),
  size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  color: color.nullable().optional(),
  label: z.string().trim().max(60).nullable().optional(),
});

export const sitePlanSchema = z
  .object({
    version: z.literal(1),
    walls: z.array(wallSchema).max(LIMITS.walls),
    openings: z.array(openingSchema).max(LIMITS.openings),
    rooms: z.array(roomSchema).max(LIMITS.rooms),
    props: z.array(propSchema).max(LIMITS.props),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set<string>();
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    for (const [group, list] of [["walls", plan.walls], ["openings", plan.openings], ["rooms", plan.rooms], ["props", plan.props]] as const) {
      list.forEach((el, i) => {
        if (ids.has(el.id)) issue([group, i, "id"], "Identifiant en double");
        ids.add(el.id);
      });
    }
    const walls = new Map(plan.walls.map((w) => [w.id, w]));
    plan.walls.forEach((w, i) => {
      if (wallLength(w) < 0.1) issue(["walls", i], "Mur trop court (10 cm minimum)");
    });
    plan.openings.forEach((o, i) => {
      const w = walls.get(o.wallId);
      if (!w) return issue(["openings", i, "wallId"], "Mur introuvable");
      const len = wallLength(w);
      if (o.offset - o.width / 2 < -0.001 || o.offset + o.width / 2 > len + 0.001) issue(["openings", i], "L'ouverture dépasse de son mur");
      if (o.sill + o.height > w.height + 0.001) issue(["openings", i], "L'ouverture est plus haute que son mur");
    });
    plan.rooms.forEach((r, i) => {
      if (polygonArea(r.polygon) < 0.25) issue(["rooms", i, "polygon"], "Pièce de surface nulle");
    });
    plan.props.forEach((p, i) => {
      const d = PROP_CATALOG[p.type];
      if (p.size.some((s, k) => s < d.min[k]! - 0.001 || s > d.max[k]! + 0.001)) issue(["props", i, "size"], `Dimensions hors limites pour « ${d.label} »`);
    });
  });

export type SitePlan = z.infer<typeof sitePlanSchema>;
export type Wall = SitePlan["walls"][number];
export type Opening = SitePlan["openings"][number];
export type Room = SitePlan["rooms"][number];
export type Prop = SitePlan["props"][number];
export type WallMaterial = Wall["material"];
export type OpeningKind = Opening["kind"];
export type FloorKind = Room["floor"];

export const EMPTY_PLAN: SitePlan = { version: 1, walls: [], openings: [], rooms: [], props: [] };

/** Dimensions par défaut d'une ouverture posée avec l'outil correspondant. */
export const OPENING_DEFAULTS: Record<OpeningKind, { width: number; height: number; sill: number }> = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  "double-door": { width: 1.6, height: 2.1, sill: 0 },
  sectional: { width: 4, height: 4.2, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 1 },
  opening: { width: 2, height: 2.4, sill: 0 },
};
