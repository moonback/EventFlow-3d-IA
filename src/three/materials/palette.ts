import * as THREE from "three";
import type { SceneItem } from "@/features/scene/types";

/** Couleurs d'état partagées entre la 3D et le plan 2D. */
export const STATUS_COLORS: Record<SceneItem["status"], string> = {
  ok: "#22c55e",
  info: "#38bdf8",
  warning: "#f59e0b",
  danger: "#ef4444",
  idle: "#64748b",
};

export const STATUS_LABELS: Record<SceneItem["status"], string> = {
  ok: "Normal",
  info: "En activité",
  warning: "Attention",
  danger: "Alerte",
  idle: "Inactif",
};

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Matériaux « lumineux » (balises d'état, néons, lampadaires…) : leur émission est amplifiée quand
 * l'effet de halo (bloom) est actif, pour qu'eux seuls dépassent le seuil de luminance.
 */
const glowing = new Set<THREE.MeshStandardMaterial>();
let glowBoost = 1;
export function setGlowBoost(factor: number) {
  glowBoost = factor;
  for (const m of glowing) m.emissiveIntensity = (m.userData.baseEmissive as number) * factor;
}

/** Matériaux mis en cache (réutilisés par tous les objets : moins d'allocations GPU). */
export function standard(color: string, opts: { emissive?: string; emissiveIntensity?: number; roughness?: number; metalness?: number; transparent?: boolean; opacity?: number; glow?: boolean } = {}) {
  const key = `${color}|${opts.emissive ?? ""}|${opts.emissiveIntensity ?? 0}|${opts.roughness ?? 0.7}|${opts.metalness ?? 0.1}|${opts.opacity ?? 1}|${opts.glow ? "g" : ""}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      emissive: opts.emissive ?? "#000000",
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      roughness: opts.roughness ?? 0.7,
      metalness: opts.metalness ?? 0.1,
      transparent: opts.transparent ?? (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    if (opts.glow) {
      m.userData.baseEmissive = opts.emissiveIntensity ?? 0;
      m.emissiveIntensity *= glowBoost;
      glowing.add(m);
    }
    cache.set(key, m);
  }
  return m;
}

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
export const RING = new THREE.RingGeometry(0.9, 1.05, 48);
export const PLANE = new THREE.PlaneGeometry(1, 1);

const glowCache = new Map<string, THREE.Color>();

/** Couleur « HDR » (> 1) pour les matériaux non tonemappés : seuls ces éléments déclenchent le bloom. */
export function glow(hex: string, intensity = 2.5) {
  const key = `${hex}|${intensity}`;
  let c = glowCache.get(key);
  if (!c) {
    c = new THREE.Color(hex).multiplyScalar(intensity);
    glowCache.set(key, c);
  }
  return c;
}
