"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { planObstacles, type Rect } from "@/features/site-plan/geometry";
import type { SitePlan } from "@/features/site-plan/schema";
import type { SceneItem } from "@/features/scene/types";
import { useAnimation } from "../effects/motion";
import { activeFleetCount, FLEET } from "../objects/warehouse-fleet";

const EYE = 1.7;
const BODY = 0.35;
const WALK = 4.5; // m/s
const RUN = 9;
const LOOK = 0.0035; // rad par pixel

/** Emprise au sol d'un objet métier (les aires au sol restent praticables). */
function footprint(i: SceneItem): Rect | null {
  const [x, , z] = i.position;
  const s = i.scale;
  const r = (w: number, d: number): Rect => ({ x, z, w: w * s, d: d * s, rot: i.rotationY });
  switch (i.kind) {
    case "STOCK_LOCATION":
      return i.variant === "rack" ? r(4.2, 1.4) : null;
    case "VEHICLE":
      return i.variant === "truck" ? r(6.4, 2.3) : r(4.8, 2.3);
    case "DOCK":
      return r(2.4, 4.2);
    case "EVENT":
      return r(3.4 * (i.size ?? 1), 3.4 * (i.size ?? 1));
    case "CALENDAR_BOARD":
      return i.week ? r(9.4, 0.5) : r(3.4, 0.5);
    case "STAFF_DESK":
      return r(1.8, 1.9);
    case "MISSION_MAP":
      return r(7.4, 0.5);
    case "MEETING_TABLE":
      return r(3, 3);
    case "QUOTE_MAILBOX":
      return null; // posée sur le bureau de direction
    case "INVOICE_SAFE":
      return r(2, 1);
    default:
      return r(3.4, 0.5);
  }
}

function blocked(px: number, pz: number, rects: Rect[]) {
  if (Math.abs(px) > 100 || Math.abs(pz) > 100) return true;
  return rects.some((r) => {
    const dx = px - r.x;
    const dz = pz - r.z;
    const c = Math.cos(r.rot);
    const s = Math.sin(r.rot);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.abs(lx) < r.w / 2 + BODY && Math.abs(lz) < r.d / 2 + BODY;
  });
}

/**
 * Visite à la première personne : caméra à hauteur d'homme, déplacement au clavier (ZQSD / WASD / flèches,
 * Maj pour courir), regard à la souris (cliquer-glisser), collisions avec les murs et les objets. Échap pour quitter.
 */
export function WalkControls({ items, plan, onExit, movementsToday = 0 }: { items: SceneItem[]; plan: SitePlan; onExit: () => void; movementsToday?: number }) {
  const animated = useAnimation("fleet");
  const moving = animated ? activeFleetCount(movementsToday) : 0;
  const { camera, gl, invalidate } = useThree();
  const keys = useRef(new Set<string>());
  const yaw = useRef(Math.PI / 2); // face à l'ouest : entrée principale de l'entrepôt
  const pitch = useRef(-0.05);
  const obstacles = useMemo<Rect[]>(
    () => [
      // Murs pleins et accessoires du plan du site (portes et passages franchissables)
      ...planObstacles(plan),
      ...items.flatMap((i) => footprint(i) ?? []),
      // Engins de l'entrepôt stationnés (ceux qui circulent ne bloquent pas le passage)
      ...FLEET.slice(moving).map((v) => ({ x: v.parked.position[0], z: v.parked.position[1], w: v.model === "forklift" ? 3 : 2, d: 1.3, rot: v.parked.rotationY })),
    ],
    [items, plan, moving],
  );

  useEffect(() => {
    // Départ devant l'entrée principale de l'entrepôt, entre le mur et les quais
    camera.position.set(24.6, EYE, 0);
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    invalidate();
    const typing = (e: KeyboardEvent) => /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.key === "Escape") return onExit();
      const k = e.key.toLowerCase();
      if (["z", "q", "s", "d", "w", "a", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
        e.preventDefault();
        keys.current.add(k);
        invalidate();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    let dragging = false;
    const el = gl.domElement;
    const pdown = (e: PointerEvent) => {
      dragging = true;
      el.setPointerCapture(e.pointerId);
    };
    const pup = () => (dragging = false);
    const pmove = (e: PointerEvent) => {
      if (!dragging) return;
      yaw.current -= e.movementX * LOOK;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - e.movementY * LOOK));
      invalidate();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    el.addEventListener("pointerdown", pdown);
    el.addEventListener("pointerup", pup);
    el.addEventListener("pointermove", pmove);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      el.removeEventListener("pointerdown", pdown);
      el.removeEventListener("pointerup", pup);
      el.removeEventListener("pointermove", pmove);
    };
  }, [camera, gl, invalidate, onExit]);

  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    const k = keys.current;
    const f = (k.has("z") || k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    const r = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("q") || k.has("a") || k.has("arrowleft") ? 1 : 0);
    if (f || r) {
      forward.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      right.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current));
      const speed = (k.has("shift") ? RUN : WALK) * Math.min(delta, 0.05);
      const dx = (forward.x * f + right.x * r) * speed;
      const dz = (forward.z * f + right.z * r) * speed;
      const { x, z } = camera.position;
      // Point de départ dans un obstacle (objet déplacé dessus) : on laisse sortir librement
      if (blocked(x, z, obstacles)) {
        camera.position.set(x + dx, EYE, z + dz);
        state.invalidate();
        return;
      }
      // Glissement le long des obstacles : on tente le déplacement complet, puis chaque axe séparément
      if (!blocked(x + dx, z + dz, obstacles)) camera.position.set(x + dx, EYE, z + dz);
      else if (!blocked(x + dx, z, obstacles)) camera.position.set(x + dx, EYE, z);
      else if (!blocked(x, z + dz, obstacles)) camera.position.set(x, EYE, z + dz);
      state.invalidate();
    }
  });
  return null;
}
