/**
 * Opérations d'édition pures sur le plan du site (aucune mutation) et historique annuler / rétablir.
 * Les murs jointifs restent attachés : déplacer une extrémité entraîne les extrémités confondues.
 */
import { fitOpening, wallLength, type Vec2 } from "./geometry";
import type { Prop, SitePlan, Wall } from "./schema";

let counter = 0;
/** Identifiant court et unique (horodatage + compteur + aléa), compatible avec le schéma. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1296;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

const same = (p: Vec2, q: Vec2) => Math.abs(p[0] - q[0]) < 1e-3 && Math.abs(p[1] - q[1]) < 1e-3;

/** Supprime des éléments ; les ouvertures des murs supprimés partent avec eux. */
export function removeElements(plan: SitePlan, ids: Set<string>): SitePlan {
  return {
    ...plan,
    walls: plan.walls.filter((w) => !ids.has(w.id)),
    openings: plan.openings.filter((o) => !ids.has(o.id) && !ids.has(o.wallId)),
    rooms: plan.rooms.filter((r) => !ids.has(r.id)),
    props: plan.props.filter((p) => !ids.has(p.id)),
  };
}

/** Recale les ouvertures des murs modifiés ; celles qui ne tiennent plus sont retirées. */
export function refitOpenings(plan: SitePlan, wallIds: Set<string>): SitePlan {
  const walls = new Map(plan.walls.map((w) => [w.id, w]));
  return {
    ...plan,
    openings: plan.openings.flatMap((o) => {
      if (!wallIds.has(o.wallId)) return [o];
      const w = walls.get(o.wallId);
      if (!w) return [];
      const offset = fitOpening(wallLength(w), o.offset, o.width);
      if (offset === null) return [];
      return [{ ...o, offset, height: Math.min(o.height, w.height - o.sill) }].filter((x) => x.height >= 0.3);
    }),
  };
}

/** Déplace des points du plan : toute extrémité de mur confondue avec l'un des points `from` suit. */
function movePoints(plan: SitePlan, moves: { from: Vec2; to: Vec2 }[], only?: Set<string>): SitePlan {
  const changed = new Set<string>();
  const target = (p: Vec2) => moves.find((m) => same(m.from, p))?.to;
  const walls = plan.walls.map((w): Wall => {
    if (only && !only.has(w.id)) return w;
    const a = target(w.a);
    const b = target(w.b);
    if (!a && !b) return w;
    changed.add(w.id);
    return { ...w, a: a ?? w.a, b: b ?? w.b };
  });
  return refitOpenings({ ...plan, walls }, changed);
}

/** Déplace une extrémité de mur (et les extrémités jointives si `joined`). */
export function moveWallEnd(plan: SitePlan, wallId: string, end: "a" | "b", to: Vec2, joined = true): SitePlan {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall) return plan;
  return movePoints(plan, [{ from: wall[end], to }], joined ? undefined : new Set([wallId]));
}

/** Translate un mur entier ; les murs qui lui sont raccordés s'allongent pour rester attachés. */
export function translateWall(plan: SitePlan, wallId: string, d: Vec2): SitePlan {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall) return plan;
  const shift = (p: Vec2): Vec2 => [Math.round((p[0] + d[0]) * 1000) / 1000, Math.round((p[1] + d[1]) * 1000) / 1000];
  return movePoints(plan, [
    { from: wall.a, to: shift(wall.a) },
    { from: wall.b, to: shift(wall.b) },
  ]);
}

/** Remplace un élément (repéré par son identifiant) dans sa collection. */
export function updateElement<K extends "walls" | "openings" | "rooms" | "props">(plan: SitePlan, key: K, id: string, patch: Partial<SitePlan[K][number]>): SitePlan {
  const list = plan[key] as SitePlan[K][number][];
  const next = { ...plan, [key]: list.map((el) => (el.id === id ? { ...el, ...patch } : el)) } as SitePlan;
  return key === "walls" ? refitOpenings(next, new Set([id])) : next;
}

/**
 * Coupe un mur en deux à une distance donnée de son extrémité a (jonction en T, changement de
 * matériau). Chaque ouverture suit le morceau qui contient son centre, puis est recalée.
 */
export function splitWall(plan: SitePlan, wallId: string, at: number): { plan: SitePlan; ids: [string, string] | null } {
  const wall = plan.walls.find((w) => w.id === wallId);
  const len = wall ? wallLength(wall) : 0;
  if (!wall || at < 0.1 || at > len - 0.1) return { plan, ids: null };
  const t = at / len;
  const cut: Vec2 = [Math.round((wall.a[0] + (wall.b[0] - wall.a[0]) * t) * 1000) / 1000, Math.round((wall.a[1] + (wall.b[1] - wall.a[1]) * t) * 1000) / 1000];
  const first: Wall = { ...wall, b: cut };
  const second: Wall = { ...wall, id: newId("wall"), a: cut };
  const next: SitePlan = {
    ...plan,
    walls: plan.walls.flatMap((w) => (w.id === wallId ? [first, second] : [w])),
    openings: plan.openings.map((o) => (o.wallId !== wallId || o.offset <= at ? o : { ...o, wallId: second.id, offset: o.offset - at })),
  };
  return { plan: refitOpenings(next, new Set([first.id, second.id])), ids: [first.id, second.id] };
}

/** Duplique un accessoire, décalé d'un demi-mètre. */
export function duplicateProp(plan: SitePlan, id: string): { plan: SitePlan; id: string | null } {
  const p = plan.props.find((x) => x.id === id);
  if (!p) return { plan, id: null };
  const copy: Prop = { ...p, id: newId("prop"), position: [p.position[0] + 0.5, p.position[1] + 0.5] };
  return { plan: { ...plan, props: [...plan.props, copy] }, id: copy.id };
}

/** Points d'accroche du magnétisme : extrémités des murs et sommets des pièces. */
export function anchorPoints(plan: SitePlan, exclude?: string): Vec2[] {
  return [...plan.walls.filter((w) => w.id !== exclude).flatMap((w) => [w.a, w.b]), ...plan.rooms.filter((r) => r.id !== exclude).flatMap((r) => r.polygon)];
}

// ─── Historique ──────────────────────────────────────────────────────────

export interface History {
  past: SitePlan[];
  present: SitePlan;
  future: SitePlan[];
}

const MAX_HISTORY = 100;

export const initHistory = (plan: SitePlan): History => ({ past: [], present: plan, future: [] });

export function commit(h: History, next: SitePlan): History {
  if (next === h.present) return h;
  return { past: [...h.past.slice(-(MAX_HISTORY - 1)), h.present], present: next, future: [] };
}

export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) };
}
