"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PROP_CATALOG, type PropType } from "@/features/site-plan/catalog";
import { nearestWall, pointOnWall, polygonArea, polygonCentroid, snapPoint, wallDir, wallLength, fitOpening, type Vec2 } from "@/features/site-plan/geometry";
import { anchorPoints, moveWallEnd, newId, translateWall } from "@/features/site-plan/history";
import { OPENING_DEFAULTS, type Opening, type Prop, type SitePlan, type Wall } from "@/features/site-plan/schema";
import type { SceneItem } from "@/features/scene/types";
import { FLOOR_COLORS, WALL_COLORS } from "../../site/site-plan-view";
import type { Selection, Tool, View } from "./types";

/**
 * Plan 2D éditable (SVG, vue de dessus, mètres). Le canevas ne garde que l'état d'interaction en cours
 * (tracé, glisser) : chaque modification passe par onPreview (pendant un glisser) puis onCommit.
 */
interface Props {
  plan: SitePlan;
  items: SceneItem[];
  tool: Tool;
  propType: PropType;
  selection: Selection;
  grid: number | null;
  view: View;
  onView: (v: View) => void;
  onSelect: (s: Selection) => void;
  onPreview: (plan: SitePlan | null) => void;
  onCommit: (plan: SitePlan, select?: Selection) => void;
  onCursor: (p: Vec2 | null) => void;
  onDrawing: (drawing: boolean) => void;
}

type Drag =
  | { type: "pan"; start: Vec2; view: View; inverse: DOMMatrix }
  | { type: "wall"; id: string; start: Vec2 }
  | { type: "wall-end"; id: string; end: "a" | "b" }
  | { type: "opening"; id: string }
  | { type: "prop"; id: string; grab: Vec2 }
  | { type: "room"; id: string; start: Vec2 }
  | { type: "vertex"; id: string; index: number };

const ANGLE_STEP = Math.PI / 12; // 15°
const BG = "#0b0f19";
const ACCENT = "#a5b4fc";
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const deg = (rad: number) => (rad * 180) / Math.PI;

/** Emprise au sol d'un objet métier (repère, lecture seule). */
function itemSize(i: SceneItem): [number, number] {
  switch (i.kind) {
    case "STOCK_LOCATION":
      return i.variant === "rack" ? [4.2, 1.4] : [7.5, 5];
    case "VEHICLE":
      return [i.variant === "truck" ? 6.4 : 4.8, 2.3];
    case "DOCK":
      return [2.4, 4.2];
    case "STAFF_DESK":
      return [1.8, 1.9];
    case "MEETING_TABLE":
      return [3, 3];
    case "EVENT":
      return [3.4 * (i.size ?? 1), 3.4 * (i.size ?? 1)];
    case "QUOTE_MAILBOX":
      return [0.6, 0.4];
    case "INVOICE_SAFE":
      return [2, 1];
    case "CALENDAR_BOARD":
      return [i.week ? 9.4 : 3.4, 0.5];
    case "MISSION_MAP":
      return [7.4, 0.5];
    default:
      return [3.4, 0.5];
  }
}

function OpeningSymbol({ wall, o, scale, selected }: { wall: Wall; o: Opening; scale: number; selected: boolean }) {
  const [ux, uz] = wallDir(wall);
  const n: Vec2 = [-uz, ux];
  const p0 = pointOnWall(wall, o.offset - o.width / 2);
  const p1 = pointOnWall(wall, o.offset + o.width / 2);
  const stroke = selected ? ACCENT : "#e2e8f0";
  const sw = 1.5 * scale;
  const leaf = (hinge: Vec2, free: Vec2, w: number, key: string) => {
    const tip: Vec2 = [hinge[0] + n[0] * w, hinge[1] + n[1] * w];
    return (
      <g key={key}>
        <line x1={hinge[0]} y1={hinge[1]} x2={tip[0]} y2={tip[1]} stroke={stroke} strokeWidth={sw} />
        <path d={`M ${tip[0]} ${tip[1]} A ${w} ${w} 0 0 ${key === "b" ? 0 : 1} ${free[0]} ${free[1]}`} fill="none" stroke={stroke} strokeWidth={sw * 0.7} strokeDasharray={`${4 * scale} ${3 * scale}`} />
      </g>
    );
  };
  const mid = pointOnWall(wall, o.offset);
  return (
    <g pointerEvents="none">
      <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke={BG} strokeWidth={wall.thickness + 0.04} />
      {o.kind === "door" ? leaf(p0, p1, o.width, "a") : null}
      {o.kind === "double-door" ? [leaf(p0, mid, o.width / 2, "a"), leaf(p1, mid, o.width / 2, "b")] : null}
      {o.kind === "window" ? (
        <>
          <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke="#7dd3fc" strokeWidth={Math.max(wall.thickness * 0.35, 2 * scale)} />
          <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke={stroke} strokeWidth={sw * 0.6} />
        </>
      ) : null}
      {o.kind === "sectional" ? <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke={stroke} strokeWidth={sw} strokeDasharray={`${6 * scale} ${4 * scale}`} /> : null}
      {[p0, p1].map((p, i) => (
        <line key={i} x1={p[0] - n[0] * wall.thickness * 0.7} y1={p[1] - n[1] * wall.thickness * 0.7} x2={p[0] + n[0] * wall.thickness * 0.7} y2={p[1] + n[1] * wall.thickness * 0.7} stroke={stroke} strokeWidth={sw} />
      ))}
    </g>
  );
}

export function PlanCanvas({ plan, items, tool, propType, selection, grid, view, onView, onSelect, onPreview, onCommit, onCursor, onDrawing }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [cursor, setCursor] = useState<{ raw: Vec2; snapped: Vec2; anchored: boolean } | null>(null);
  const [wallStart, setWallStart] = useState<Vec2 | null>(null);
  const [roomPts, setRoomPts] = useState<Vec2[]>([]);
  const [space, setSpace] = useState(false);
  const drag = useRef<{ d: Drag; base: SitePlan; client: Vec2; moved: boolean; last: SitePlan | null } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Taille d'un pixel écran en mètres (viewBox en « meet » : la plus grande des deux échelles)
  const scale = Math.max(view.w / size.w, view.h / size.h);
  const drawing = Boolean(wallStart) || roomPts.length > 0;
  useEffect(() => onDrawing(drawing), [drawing, onDrawing]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: Math.max(1, e.contentRect.width), h: Math.max(1, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toWorld = useCallback((clientX: number, clientY: number, inverse?: DOMMatrix): Vec2 => {
    const svg = svgRef.current!;
    const m = inverse ?? svg.getScreenCTM()!.inverse();
    const p = new DOMPoint(clientX, clientY).matrixTransform(m);
    return [p.x, p.y];
  }, []);

  // Zoom à la molette centré sur le curseur (écouteur non passif pour bloquer le défilement de la page)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const f = Math.exp(Math.sign(e.deltaY) * Math.min(0.4, Math.abs(e.deltaY) / 300));
      const w = Math.min(400, Math.max(4, v.w * f));
      const k = w / v.w;
      const [px, py] = toWorld(e.clientX, e.clientY);
      onView({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, w, h: v.h * k });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onView, toWorld]);

  // Espace maintenu : déplacement de la vue ; Échap / Entrée : fin du tracé en cours
  useEffect(() => {
    const typing = (e: KeyboardEvent) => /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpace(true);
      } else if (e.key === "Escape") {
        setWallStart(null);
        setRoomPts([]);
      } else if (e.key === "Enter" && roomPts.length >= 3) closeRoom(roomPts);
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  // Changer d'outil abandonne le tracé en cours
  useEffect(() => {
    setWallStart(null);
    setRoomPts([]);
  }, [tool]);

  const snap = (raw: Vec2, opts: { from?: Vec2 | null; exclude?: string; free?: boolean } = {}) =>
    snapPoint(raw, { grid, anchors: [...anchorPoints(plan, opts.exclude), ...(tool === "room" ? roomPts : [])], radius: 10 * scale + 0.15, from: opts.from, angleStep: opts.from && !opts.free ? ANGLE_STEP : null });

  const closeRoom = (pts: Vec2[]) => {
    setRoomPts([]);
    if (pts.length < 3 || polygonArea(pts) < 0.25) return;
    const id = newId("room");
    const n = plan.rooms.length + 1;
    onCommit({ ...plan, rooms: [...plan.rooms, { id, name: `Pièce ${n}`, polygon: pts, floor: "tiles", roofHeight: null }] }, { kind: "room", id });
  };

  const hoverWall = useMemo(() => {
    if (!cursor || (tool !== "door" && tool !== "window")) return null;
    return nearestWall(plan.walls, cursor.raw, Math.max(0.6, 14 * scale));
  }, [cursor, tool, plan.walls, scale]);

  const pick = (target: EventTarget | null) => {
    const el = (target as Element | null)?.closest?.("[data-el]") as SVGElement | null;
    if (!el) return null;
    return { kind: el.dataset.el as NonNullable<Selection>["kind"], id: el.dataset.id!, handle: (target as Element).closest("[data-handle]")?.getAttribute("data-handle") ?? null };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!;
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      /* pointeur déjà relâché (événement synthétique) : le glisser reste suivi sur le SVG */
    }
    const raw = toWorld(e.clientX, e.clientY);
    const client: Vec2 = [e.clientX, e.clientY];
    const startPan = () => (drag.current = { d: { type: "pan", start: client, view, inverse: svg.getScreenCTM()!.inverse() }, base: plan, client, moved: false, last: null });
    if (e.button === 1 || e.button === 2 || space) return startPan();
    if (e.button !== 0) return;

    if (tool === "wall") {
      const p = snap(raw, { from: wallStart, free: e.shiftKey }).point;
      if (!wallStart) return setWallStart(p);
      if (Math.hypot(p[0] - wallStart[0], p[1] - wallStart[1]) < 0.1) return;
      const id = newId("wall");
      const prev = plan.walls.find((w) => w.id === selection?.id);
      const wall: Wall = { id, a: wallStart, b: p, thickness: prev?.thickness ?? 0.2, height: prev?.height ?? 3, material: prev?.material ?? "plaster" };
      onCommit({ ...plan, walls: [...plan.walls, wall] }, { kind: "wall", id });
      setWallStart(p);
      return;
    }
    if (tool === "room") {
      const s = snap(raw, { from: roomPts.at(-1) ?? null, free: e.shiftKey });
      const first = roomPts[0];
      if (first && roomPts.length >= 3 && Math.hypot(s.point[0] - first[0], s.point[1] - first[1]) < 1e-3) return closeRoom(roomPts);
      const last = roomPts.at(-1);
      if (last && Math.hypot(s.point[0] - last[0], s.point[1] - last[1]) < 0.05) return;
      setRoomPts([...roomPts, s.point]);
      return;
    }
    if (tool === "door" || tool === "window") {
      // Mur visé recalculé au clic (un clic sans mouvement préalable n'a pas mis à jour le survol)
      const hoverWall = nearestWall(plan.walls, raw, Math.max(0.6, 14 * scale));
      if (!hoverWall) return;
      const kind = tool === "door" ? "door" : "window";
      const d = OPENING_DEFAULTS[kind];
      const len = wallLength(hoverWall.wall);
      const width = Math.min(d.width, Math.max(0.3, len - 0.05));
      const offset = fitOpening(len, grid ? Math.round(hoverWall.offset / Math.min(grid, 0.1)) * Math.min(grid, 0.1) : hoverWall.offset, width);
      if (offset === null) return;
      const id = newId(kind);
      const height = Math.min(d.height, hoverWall.wall.height - d.sill);
      if (height < 0.3) return;
      onCommit({ ...plan, openings: [...plan.openings, { id, wallId: hoverWall.wall.id, offset, width, height, sill: d.sill, kind }] }, { kind: "opening", id });
      return;
    }
    if (tool === "prop") {
      const p = snap(raw).point;
      const def = PROP_CATALOG[propType];
      const id = newId("prop");
      const prop: Prop = { id, type: propType, position: p, elevation: 0, rotationY: 0, size: [...def.size] };
      onCommit({ ...plan, props: [...plan.props, prop] }, { kind: "prop", id });
      return;
    }

    // Outil de sélection
    const hit = pick(e.target);
    if (!hit) {
      onSelect(null);
      return startPan();
    }
    onSelect({ kind: hit.kind, id: hit.id });
    let d: Drag | null = null;
    if (hit.kind === "wall") d = hit.handle === "a" || hit.handle === "b" ? { type: "wall-end", id: hit.id, end: hit.handle } : { type: "wall", id: hit.id, start: raw };
    else if (hit.kind === "opening") d = { type: "opening", id: hit.id };
    else if (hit.kind === "prop") {
      const p = plan.props.find((x) => x.id === hit.id)!;
      d = { type: "prop", id: hit.id, grab: [raw[0] - p.position[0], raw[1] - p.position[1]] };
    } else if (hit.kind === "room") d = hit.handle !== null ? { type: "vertex", id: hit.id, index: Number(hit.handle) } : { type: "room", id: hit.id, start: raw };
    if (d) drag.current = { d, base: plan, client, moved: false, last: null };
  };

  const snapDelta = (from: Vec2, to: Vec2): Vec2 => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    return grid ? [r3(Math.round(dx / grid) * grid), r3(Math.round(dz / grid) * grid)] : [r3(dx), r3(dz)];
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const raw = toWorld(e.clientX, e.clientY);
    const from = tool === "wall" ? wallStart : tool === "room" ? (roomPts.at(-1) ?? null) : null;
    const s = snap(raw, { from, free: e.shiftKey });
    setCursor({ raw, snapped: s.point, anchored: s.anchored });
    onCursor(s.point);
    const cur = drag.current;
    if (!cur) return;
    if (!cur.moved && Math.hypot(e.clientX - cur.client[0], e.clientY - cur.client[1]) < 3) return;
    cur.moved = true;
    const { d, base } = cur;
    let next: SitePlan | null = null;
    switch (d.type) {
      case "pan": {
        const [sx, sy] = toWorld(d.start[0], d.start[1], d.inverse);
        const [cx, cy] = toWorld(e.clientX, e.clientY, d.inverse);
        onView({ ...d.view, x: d.view.x - (cx - sx), y: d.view.y - (cy - sy) });
        return;
      }
      case "wall":
        next = translateWall(base, d.id, snapDelta(d.start, raw));
        break;
      case "wall-end": {
        const w = base.walls.find((x) => x.id === d.id);
        if (!w) return;
        const other = d.end === "a" ? w.b : w.a;
        const p = snapPoint(raw, { grid, anchors: anchorPoints(base, d.id).filter((a) => Math.hypot(a[0] - w[d.end][0], a[1] - w[d.end][1]) > 1e-3), radius: 10 * scale + 0.15, from: other, angleStep: e.shiftKey ? null : ANGLE_STEP }).point;
        if (Math.hypot(p[0] - other[0], p[1] - other[1]) < 0.1) return;
        next = moveWallEnd(base, d.id, d.end, p, !e.altKey);
        break;
      }
      case "opening": {
        const o = base.openings.find((x) => x.id === d.id);
        const w = o && base.walls.find((x) => x.id === o.wallId);
        if (!o || !w) return;
        const t = Math.max(0, Math.min(wallLength(w), (raw[0] - w.a[0]) * wallDir(w)[0] + (raw[1] - w.a[1]) * wallDir(w)[1]));
        const offset = fitOpening(wallLength(w), grid ? Math.round(t / Math.min(grid, 0.1)) * Math.min(grid, 0.1) : t, o.width);
        if (offset === null) return;
        next = { ...base, openings: base.openings.map((x) => (x.id === d.id ? { ...x, offset } : x)) };
        break;
      }
      case "prop": {
        const target: Vec2 = [raw[0] - d.grab[0], raw[1] - d.grab[1]];
        const p = grid ? snapPoint(target, { grid }).point : ([r3(target[0]), r3(target[1])] as Vec2);
        next = { ...base, props: base.props.map((x) => (x.id === d.id ? { ...x, position: p } : x)) };
        break;
      }
      case "room": {
        const [dx, dz] = snapDelta(d.start, raw);
        next = { ...base, rooms: base.rooms.map((r) => (r.id === d.id ? { ...r, polygon: r.polygon.map(([x, z]) => [r3(x + dx), r3(z + dz)] as Vec2) } : r)) };
        break;
      }
      case "vertex": {
        const p = snap(raw, { exclude: d.id }).point;
        next = { ...base, rooms: base.rooms.map((r) => (r.id === d.id ? { ...r, polygon: r.polygon.map((v, i) => (i === d.index ? p : v)) } : r)) };
        break;
      }
    }
    if (next) {
      cur.last = next;
      onPreview(next);
    }
  };

  const onPointerUp = () => {
    const cur = drag.current;
    drag.current = null;
    if (cur?.last) onCommit(cur.last);
    else onPreview(null);
  };

  const onDoubleClick = () => {
    if (tool === "wall") setWallStart(null);
    if (tool === "room" && roomPts.length >= 3) closeRoom(roomPts);
  };

  const sel = selection;
  const selectedWall = sel?.kind === "wall" ? plan.walls.find((w) => w.id === sel.id) : null;
  const selectedRoom = sel?.kind === "room" ? plan.rooms.find((r) => r.id === sel.id) : null;
  const wallsById = useMemo(() => new Map(plan.walls.map((w) => [w.id, w])), [plan.walls]);
  const fs = 12 * scale;
  const props = useMemo(() => [...plan.props].sort((a, b) => Number(b.type === "rug") - Number(a.type === "rug") || a.elevation - b.elevation), [plan.props]);
  const cursorStyle = space || drag.current?.d.type === "pan" ? "grabbing" : tool === "select" ? "default" : (tool === "door" || tool === "window") && !hoverWall ? "not-allowed" : "crosshair";

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none select-none"
      style={{ cursor: cursorStyle, background: BG }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        setCursor(null);
        onCursor(null);
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      role="application"
      aria-label="Plan du site éditable : murs, ouvertures, pièces et accessoires"
    >
      <defs>
        <pattern id="grid-1" width={1} height={1} patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#1e293b" strokeWidth={scale} />
        </pattern>
        <pattern id="grid-5" width={5} height={5} patternUnits="userSpaceOnUse">
          <rect width={5} height={5} fill={scale < 0.12 ? "url(#grid-1)" : "none"} />
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#273449" strokeWidth={scale * 1.2} />
        </pattern>
      </defs>
      <rect x={-160} y={-160} width={320} height={320} fill="url(#grid-5)" pointerEvents="none" />
      <line x1={-160} y1={0} x2={160} y2={0} stroke="#334155" strokeWidth={scale} pointerEvents="none" />
      <line x1={0} y1={-160} x2={0} y2={160} stroke="#334155" strokeWidth={scale} pointerEvents="none" />

      {/* Pièces */}
      {plan.rooms.map((r) => {
        const [cx, cz] = polygonCentroid(r.polygon);
        const active = sel?.kind === "room" && sel.id === r.id;
        return (
          <g key={r.id} data-el="room" data-id={r.id} style={{ cursor: tool === "select" ? "move" : undefined }}>
            <polygon points={r.polygon.map((p) => p.join(",")).join(" ")} fill={FLOOR_COLORS[r.floor]} fillOpacity={active ? 0.55 : 0.35} stroke={active ? ACCENT : "#475569"} strokeWidth={(active ? 2 : 1) * scale} strokeDasharray={active ? undefined : `${4 * scale} ${3 * scale}`} />
            <text x={cx} y={cz} fill="#e2e8f0" fontSize={fs} textAnchor="middle" pointerEvents="none" fontWeight={600}>
              {r.name}
            </text>
            <text x={cx} y={cz + fs * 1.2} fill="#94a3b8" fontSize={fs * 0.85} textAnchor="middle" pointerEvents="none">
              {polygonArea(r.polygon).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m²
            </text>
          </g>
        );
      })}

      {/* Objets métier : repères en lecture seule */}
      <g pointerEvents="none" opacity={0.55}>
        {items.map((i) => {
          const [w, d] = itemSize(i);
          return (
            <g key={i.key} transform={`translate(${i.position[0]} ${i.position[2]}) rotate(${-deg(i.rotationY)})`}>
              <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#334155" stroke="#64748b" strokeWidth={scale} rx={0.1} />
              {scale < 0.08 ? (
                <text y={fs * 0.3} fontSize={fs * 0.75} fill="#cbd5e1" textAnchor="middle">
                  {i.label.slice(0, 18)}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>

      {/* Murs */}
      {plan.walls.map((w) => {
        const active = sel?.kind === "wall" && sel.id === w.id;
        return (
          <g key={w.id} data-el="wall" data-id={w.id} style={{ cursor: tool === "select" ? "move" : undefined }}>
            <line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke="transparent" strokeWidth={Math.max(w.thickness, 12 * scale)} />
            {active ? <line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke={ACCENT} strokeWidth={w.thickness + 4 * scale} strokeLinecap="square" /> : null}
            <line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke={w.material === "glass" ? "#7dd3fc" : WALL_COLORS[w.material] === "#1e293b" ? "#64748b" : WALL_COLORS[w.material]} strokeWidth={w.thickness} strokeLinecap="square" strokeOpacity={w.material === "glass" ? 0.7 : 1} />
          </g>
        );
      })}

      {/* Ouvertures */}
      {plan.openings.map((o) => {
        const w = wallsById.get(o.wallId);
        if (!w) return null;
        const p0 = pointOnWall(w, o.offset - o.width / 2);
        const p1 = pointOnWall(w, o.offset + o.width / 2);
        const active = sel?.kind === "opening" && sel.id === o.id;
        return (
          <g key={o.id} data-el="opening" data-id={o.id} style={{ cursor: tool === "select" ? "ew-resize" : undefined }}>
            <OpeningSymbol wall={w} o={o} scale={scale} selected={active} />
            <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke="transparent" strokeWidth={Math.max(w.thickness + 0.1, 14 * scale)} />
          </g>
        );
      })}

      {/* Accessoires */}
      {props.map((p) => {
        const def = PROP_CATALOG[p.type];
        const [w, , d] = p.size;
        const active = sel?.kind === "prop" && sel.id === p.id;
        return (
          <g key={p.id} data-el="prop" data-id={p.id} transform={`translate(${p.position[0]} ${p.position[1]}) rotate(${-deg(p.rotationY)})`} style={{ cursor: tool === "select" ? "move" : undefined }}>
            <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={p.color ?? def.color} fillOpacity={p.type === "rug" ? 0.5 : 0.85} stroke={active ? ACCENT : "#0f172a"} strokeWidth={(active ? 2.5 : 1) * scale} rx={Math.min(w, d) * 0.08} />
            {/* Avant de l'accessoire (côté +z local) */}
            <line x1={-w * 0.3} y1={d / 2} x2={w * 0.3} y2={d / 2} stroke={active ? ACCENT : "#f8fafc"} strokeWidth={2 * scale} strokeOpacity={0.8} pointerEvents="none" />
            {active || scale < 0.05 ? (
              <text y={-d / 2 - fs * 0.4} fontSize={fs * 0.8} fill="#e2e8f0" textAnchor="middle" pointerEvents="none" transform={`rotate(${deg(p.rotationY)} 0 ${-d / 2 - fs * 0.4})`}>
                {p.label || def.label}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* Poignées et cotes de la sélection */}
      {selectedWall ? (
        <g>
          {(["a", "b"] as const).map((end) => (
            <circle key={end} data-el="wall" data-id={selectedWall.id} data-handle={end} cx={selectedWall[end][0]} cy={selectedWall[end][1]} r={6 * scale} fill={ACCENT} stroke={BG} strokeWidth={2 * scale} style={{ cursor: "grab" }} />
          ))}
          <text x={(selectedWall.a[0] + selectedWall.b[0]) / 2} y={(selectedWall.a[1] + selectedWall.b[1]) / 2 - selectedWall.thickness - fs * 0.6} fontSize={fs} fill={ACCENT} textAnchor="middle" pointerEvents="none" fontWeight={600}>
            {wallLength(selectedWall).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m
          </text>
        </g>
      ) : null}
      {selectedRoom
        ? selectedRoom.polygon.map((p, i) => <circle key={i} data-el="room" data-id={selectedRoom.id} data-handle={i} cx={p[0]} cy={p[1]} r={5 * scale} fill={ACCENT} stroke={BG} strokeWidth={2 * scale} style={{ cursor: "grab" }} />)
        : null}

      {/* Tracé en cours */}
      {hoverWall ? (
        <circle cx={pointOnWall(hoverWall.wall, hoverWall.offset)[0]} cy={pointOnWall(hoverWall.wall, hoverWall.offset)[1]} r={7 * scale} fill="none" stroke="#fbbf24" strokeWidth={2 * scale} pointerEvents="none" />
      ) : null}
      {tool === "wall" && wallStart && cursor ? (
        <g pointerEvents="none">
          <line x1={wallStart[0]} y1={wallStart[1]} x2={cursor.snapped[0]} y2={cursor.snapped[1]} stroke="#fbbf24" strokeWidth={0.2} strokeOpacity={0.7} strokeLinecap="square" />
          <text x={(wallStart[0] + cursor.snapped[0]) / 2} y={(wallStart[1] + cursor.snapped[1]) / 2 - fs} fontSize={fs} fill="#fbbf24" textAnchor="middle" fontWeight={600}>
            {Math.hypot(cursor.snapped[0] - wallStart[0], cursor.snapped[1] - wallStart[1]).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m
          </text>
        </g>
      ) : null}
      {tool === "room" && roomPts.length ? (
        <g pointerEvents="none">
          <polygon points={[...roomPts, ...(cursor ? [cursor.snapped] : [])].map((p) => p.join(",")).join(" ")} fill="#fbbf24" fillOpacity={0.15} stroke="#fbbf24" strokeWidth={1.5 * scale} />
          {roomPts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={(i === 0 ? 6 : 4) * scale} fill={i === 0 ? "#fbbf24" : BG} stroke="#fbbf24" strokeWidth={1.5 * scale} />
          ))}
          {cursor && roomPts.length >= 2 ? (
            <text x={cursor.snapped[0]} y={cursor.snapped[1] - fs} fontSize={fs} fill="#fbbf24" textAnchor="middle">
              {polygonArea([...roomPts, cursor.snapped]).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m²
            </text>
          ) : null}
        </g>
      ) : null}
      {cursor && tool !== "select" ? <circle cx={cursor.snapped[0]} cy={cursor.snapped[1]} r={(cursor.anchored ? 6 : 3) * scale} fill={cursor.anchored ? "#fbbf24" : "#e2e8f0"} fillOpacity={cursor.anchored ? 0.9 : 0.7} pointerEvents="none" /> : null}
    </svg>
  );
}
