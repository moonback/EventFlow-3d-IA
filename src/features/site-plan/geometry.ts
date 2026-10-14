/**
 * Géométrie pure du plan du site (sans three.js) : longueurs, découpe des murs autour des ouvertures,
 * obstacles de la visite à pied, surfaces, magnétisme. Repère : x vers l'est, z vers le sud.
 */
import { PROP_CATALOG } from "./catalog";
import type { Opening, OpeningKind, SitePlan, Wall } from "./schema";

export type Vec2 = [number, number];

export const round = (v: number, step = 0.01) => Math.round(v / step) * step;
const r2 = (v: number) => Math.round(v * 1000) / 1000;

export function wallLength(w: Pick<Wall, "a" | "b">): number {
  return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
}

/** Direction unitaire du mur (de a vers b). */
export function wallDir(w: Pick<Wall, "a" | "b">): Vec2 {
  const len = wallLength(w) || 1;
  return [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len];
}

/** Rotation autour de l'axe Y (convention three.js) qui aligne l'axe x local sur le mur. */
export function wallAngle(w: Pick<Wall, "a" | "b">): number {
  const [ux, uz] = wallDir(w);
  return Math.atan2(-uz, ux);
}

export function pointOnWall(w: Pick<Wall, "a" | "b">, offset: number): Vec2 {
  const [ux, uz] = wallDir(w);
  return [w.a[0] + ux * offset, w.a[1] + uz * offset];
}

/** Projection d'un point sur un mur : abscisse le long du mur (bornée) et distance au mur. */
export function projectOnWall(w: Pick<Wall, "a" | "b">, p: Vec2): { offset: number; distance: number } {
  const len = wallLength(w);
  const [ux, uz] = wallDir(w);
  const t = Math.max(0, Math.min(len, (p[0] - w.a[0]) * ux + (p[1] - w.a[1]) * uz));
  const q = pointOnWall(w, t);
  return { offset: t, distance: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}

/** Mur le plus proche d'un point, dans un rayon donné. */
export function nearestWall<W extends Pick<Wall, "a" | "b">>(walls: W[], p: Vec2, maxDistance: number): { wall: W; offset: number; distance: number } | null {
  let best: { wall: W; offset: number; distance: number } | null = null;
  for (const wall of walls) {
    const proj = projectOnWall(wall, p);
    if (proj.distance <= maxDistance && (!best || proj.distance < best.distance)) best = { wall, ...proj };
  }
  return best;
}

/** Recale le centre d'une ouverture pour qu'elle tienne dans le mur ; null si le mur est trop court. */
export function fitOpening(wallLen: number, offset: number, width: number): number | null {
  if (width > wallLen + 1e-6) return null;
  return r2(Math.min(wallLen - width / 2, Math.max(width / 2, offset)));
}

/** Découpe un intervalle [from, to] en segments pleins autour d'intervalles vides (triés ou non). */
export function solidIntervals(from: number, to: number, gaps: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cursor = from;
  for (const [a, b] of [...gaps].sort((x, y) => x[0] - y[0])) {
    if (a > cursor) out.push([cursor, Math.min(a, to)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < to) out.push([cursor, to]);
  return out.filter(([a, b]) => b - a > 1e-6);
}

export type PieceKind = "solid" | "glass" | "leaf" | "slats";
/** Morceau d'un mur dans son repère local : x le long du mur (0 = extrémité a), y vers le haut. */
export interface WallPiece {
  kind: PieceKind;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  opening?: OpeningKind;
}

/**
 * Découpe un mur en morceaux à dessiner : parties pleines, allèges et linteaux autour des ouvertures,
 * vitrages des fenêtres, vantaux des portes et lames des portes sectionnelles.
 */
export function wallPieces(wall: Wall, openings: Opening[]): WallPiece[] {
  const len = wallLength(wall);
  const H = wall.height;
  const own = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({ o, a: Math.max(0, o.offset - o.width / 2), b: Math.min(len, o.offset + o.width / 2) }))
    .filter((x) => x.b > x.a)
    .sort((x, y) => x.a - y.a);
  const pieces: WallPiece[] = solidIntervals(0, len, own.map((x) => [x.a, x.b])).map(([x0, x1]) => ({ kind: "solid", x0, x1, y0: 0, y1: H }));
  let cursor = 0;
  for (const { o, a, b } of own) {
    const x0 = Math.max(a, cursor);
    if (b <= x0) continue;
    cursor = b;
    const top = Math.min(H, o.sill + o.height);
    if (o.sill > 0) pieces.push({ kind: "solid", x0, x1: b, y0: 0, y1: o.sill });
    if (top < H) pieces.push({ kind: "solid", x0, x1: b, y0: top, y1: H });
    const fill: PieceKind | null = o.kind === "window" ? "glass" : o.kind === "sectional" ? "slats" : o.kind === "opening" ? null : "leaf";
    if (fill) pieces.push({ kind: fill, x0, x1: b, y0: o.sill, y1: top, opening: o.kind });
  }
  return pieces.sort((p, q) => p.x0 - q.x0 || p.y0 - q.y0);
}

/** Rectangle au sol orienté (centre, largeur sur l'axe local x, profondeur sur z, rotation Y). */
export type Rect = { x: number; z: number; w: number; d: number; rot: number };

const PASSABLE: ReadonlySet<OpeningKind> = new Set(["door", "double-door", "sectional", "opening"]);

/** Obstacles de la visite à pied : murs pleins (portes et passages franchissables, fenêtres non) et accessoires bloquants. */
export function planObstacles(plan: Pick<SitePlan, "walls" | "openings" | "props">): Rect[] {
  const walls = plan.walls.flatMap((w) => {
    const len = wallLength(w);
    const rot = wallAngle(w);
    const gaps = plan.openings.filter((o) => o.wallId === w.id && PASSABLE.has(o.kind) && o.sill < 0.3).map((o): [number, number] => [o.offset - o.width / 2, o.offset + o.width / 2]);
    return solidIntervals(0, len, gaps).map(([a, b]) => {
      const [x, z] = pointOnWall(w, (a + b) / 2);
      return { x, z, w: b - a, d: w.thickness, rot };
    });
  });
  const props = plan.props.filter((p) => PROP_CATALOG[p.type].solid && p.elevation < 1).map((p) => ({ x: p.position[0], z: p.position[1], w: p.size[0], d: p.size[2], rot: p.rotationY }));
  return [...walls, ...props];
}

/** Surface d'un polygone (formule du lacet), en m². */
export function polygonArea(points: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i]!;
    const [x2, z2] = points[(i + 1) % points.length]!;
    s += x1 * z2 - x2 * z1;
  }
  return Math.abs(s) / 2;
}

/** Centre de gravité d'un polygone (moyenne des sommets si la surface est nulle). */
export function polygonCentroid(points: Vec2[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i]!;
    const [x2, z2] = points[(i + 1) % points.length]!;
    const f = x1 * z2 - x2 * z1;
    a += f;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
  }
  if (Math.abs(a) < 1e-9) return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  return [cx / (3 * a), cz / (3 * a)];
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Le point est-il à l'intérieur d'un rectangle orienté (marge facultative) ? */
export function pointInRect(p: Vec2, r: Rect, margin = 0): boolean {
  const dx = p[0] - r.x;
  const dz = p[1] - r.z;
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  return Math.abs(dx * c - dz * s) <= r.w / 2 + margin && Math.abs(dx * s + dz * c) <= r.d / 2 + margin;
}

export interface SnapOptions {
  /** Pas de la grille (m) ; null = pas de grille */
  grid: number | null;
  /** Points d'accroche prioritaires (extrémités de murs, sommets) */
  anchors?: Vec2[];
  radius?: number;
  /** Point de départ du tracé : active le magnétisme d'angle */
  from?: Vec2 | null;
  /** Pas d'angle (radians) ; null = angle libre */
  angleStep?: number | null;
}

/** Magnétisme : extrémité existante, sinon angle par pas (longueur arrondie à la grille), sinon grille. */
export function snapPoint(p: Vec2, o: SnapOptions): { point: Vec2; anchored: boolean } {
  const radius = o.radius ?? 0.4;
  let best: Vec2 | null = null;
  let bestD = radius;
  for (const a of o.anchors ?? []) {
    const d = Math.hypot(a[0] - p[0], a[1] - p[1]);
    if (d <= bestD) {
      best = a;
      bestD = d;
    }
  }
  if (best) return { point: [best[0], best[1]], anchored: true };
  if (o.from && o.angleStep) {
    const dx = p[0] - o.from[0];
    const dz = p[1] - o.from[1];
    const angle = Math.round(Math.atan2(dz, dx) / o.angleStep) * o.angleStep;
    let len = Math.hypot(dx, dz);
    if (o.grid) len = Math.round(len / o.grid) * o.grid;
    return { point: [r2(o.from[0] + Math.cos(angle) * len), r2(o.from[1] + Math.sin(angle) * len)], anchored: false };
  }
  if (o.grid) return { point: [r2(Math.round(p[0] / o.grid) * o.grid), r2(Math.round(p[1] / o.grid) * o.grid)], anchored: false };
  return { point: [r2(p[0]), r2(p[1])], anchored: false };
}

/** Emprise du plan (murs, pièces, accessoires) ; null si le plan est vide. */
export function planBounds(plan: SitePlan): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
  const pts: Vec2[] = [...plan.walls.flatMap((w) => [w.a, w.b]), ...plan.rooms.flatMap((r) => r.polygon), ...plan.props.map((p) => p.position)];
  if (!pts.length) return null;
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    minZ: Math.min(...pts.map((p) => p[1])),
    maxX: Math.max(...pts.map((p) => p[0])),
    maxZ: Math.max(...pts.map((p) => p[1])),
  };
}
