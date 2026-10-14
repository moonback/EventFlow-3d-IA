"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { PROP_CATALOG, type PropType } from "@/features/site-plan/catalog";
import type { Prop } from "@/features/site-plan/schema";
import { BOX, CYLINDER, standard } from "../materials/palette";

/**
 * Accessoires du plan du site, entièrement procéduraux et redimensionnables : chaque modèle remplit
 * la boîte [largeur, hauteur, profondeur] de l'accessoire, posée au sol, centrée. L'avant (côté
 * utilisateur d'un bureau, assise d'un canapé) est orienté vers +z. Décor : n'intercepte pas les clics.
 */
type V3 = [number, number, number];
type ModelProps = { w: number; h: number; d: number; m: THREE.Material };

const DARK = standard("#1f2937", { roughness: 0.6, metalness: 0.4 });
const METAL = standard("#94a3b8", { metalness: 0.7, roughness: 0.35 });
const WOOD = standard("#8b5a2b", { roughness: 0.8 });
const POT = standard("#78350f", { roughness: 0.9 });
const WHITE = standard("#f8fafc", { roughness: 0.4 });
const SCREEN = standard("#1d4ed8", { emissive: "#3b82f6", emissiveIntensity: 0.6 });
const WATER = standard("#7dd3fc", { transparent: true, opacity: 0.55, roughness: 0.1 });
const BOOKS = ["#b91c1c", "#1d4ed8", "#15803d", "#a16207", "#6d28d9"].map((c) => standard(c, { roughness: 0.8 }));
const LAMP = standard("#fde68a", { emissive: "#fde68a", emissiveIntensity: 1.2, glow: true });
const ICO = new THREE.IcosahedronGeometry(0.5, 0);

function B({ p, s, m, geometry = BOX }: { p: V3; s: V3; m: THREE.Material; geometry?: THREE.BufferGeometry }) {
  return <mesh geometry={geometry} material={m} position={p} scale={s} />;
}

const legs = (w: number, d: number, h: number, inset: number, size: number, m: THREE.Material) =>
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx, sz], i) => <B key={i} p={[sx! * (w / 2 - inset), h / 2, sz! * (d / 2 - inset)]} s={[size, h, size]} m={m} />);

const MODELS: Record<PropType, (p: ModelProps) => ReactNode> = {
  desk: ({ w, h, d, m }) => (
    <>
      <B p={[0, h - 0.025, 0]} s={[w, 0.05, d]} m={m} />
      {[-1, 1].map((sx) => (
        <B key={sx} p={[sx * (w / 2 - 0.05), (h - 0.05) / 2, 0]} s={[0.05, h - 0.05, d * 0.9]} m={DARK} />
      ))}
      <B p={[0, h * 0.55, -d / 2 + 0.03]} s={[w - 0.1, h * 0.5, 0.03]} m={DARK} />
    </>
  ),
  "office-chair": ({ w, h, d, m }) => (
    <>
      <B geometry={CYLINDER} p={[0, h * 0.45, 0]} s={[Math.min(w, d) * 0.85, 0.08, Math.min(w, d) * 0.85]} m={m} />
      <B p={[0, h * 0.72, d * 0.4]} s={[w * 0.8, h * 0.45, 0.07]} m={m} />
      <B geometry={CYLINDER} p={[0, h * 0.22, 0]} s={[0.06, h * 0.44, 0.06]} m={METAL} />
      <B geometry={CYLINDER} p={[0, 0.03, 0]} s={[Math.min(w, d) * 0.9, 0.05, Math.min(w, d) * 0.9]} m={DARK} />
    </>
  ),
  "meeting-table": ({ w, h, d, m }) => (
    <>
      <B p={[0, h - 0.03, 0]} s={[w, 0.06, d]} m={m} />
      {[-1, 1].map((sx) => (
        <B key={sx} p={[sx * w * 0.3, (h - 0.06) / 2, 0]} s={[0.12, h - 0.06, d * 0.5]} m={DARK} />
      ))}
    </>
  ),
  whiteboard: ({ w, h, d }) => (
    <>
      <B p={[0, h * 0.68, 0]} s={[w, h * 0.5, 0.04]} m={WHITE} />
      <B p={[0, h * 0.68, -0.025]} s={[w + 0.06, h * 0.5 + 0.06, 0.02]} m={METAL} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <B p={[sx * (w / 2 + 0.04), h / 2, 0]} s={[0.04, h, 0.04]} m={METAL} />
          <B p={[sx * (w / 2 + 0.04), 0.02, 0]} s={[0.06, 0.04, d]} m={METAL} />
        </group>
      ))}
    </>
  ),
  "tv-screen": ({ w, h, d }) => {
    const sh = Math.min(h * 0.5, w * 0.58);
    return (
      <>
        <B p={[0, h - sh / 2, 0]} s={[w, sh, 0.06]} m={DARK} />
        <B p={[0, h - sh / 2, 0.035]} s={[w - 0.08, sh - 0.08, 0.01]} m={SCREEN} />
        <B p={[0, (h - sh) / 2, -0.02]} s={[0.08, h - sh, 0.08]} m={METAL} />
        <B p={[0, 0.02, 0]} s={[w * 0.4, 0.04, d]} m={DARK} />
      </>
    );
  },
  printer: ({ w, h, d, m }) => (
    <>
      <B p={[0, h * 0.42, 0]} s={[w, h * 0.84, d]} m={m} />
      <B p={[0, h * 0.92, 0]} s={[w * 0.9, h * 0.16, d * 0.9]} m={DARK} />
      <B p={[0, h * 0.6, d / 2 + 0.01]} s={[w * 0.6, 0.04, 0.02]} m={DARK} />
    </>
  ),
  sofa: ({ w, h, d, m }) => (
    <>
      <B p={[0, h * 0.25, d * 0.08]} s={[w, h * 0.5, d * 0.84]} m={m} />
      <B p={[0, h * 0.62, -d * 0.4]} s={[w, h * 0.76, d * 0.2]} m={m} />
      {[-1, 1].map((sx) => (
        <B key={sx} p={[sx * (w / 2 - 0.1), h * 0.36, 0]} s={[0.2, h * 0.72, d]} m={m} />
      ))}
    </>
  ),
  "coffee-table": ({ w, h, d, m }) => (
    <>
      <B p={[0, h - 0.03, 0]} s={[w, 0.06, d]} m={m} />
      {legs(w, d, h - 0.06, 0.08, 0.05, DARK)}
    </>
  ),
  rug: ({ w, h, d, m }) => <B p={[0, h / 2, 0]} s={[w, h, d]} m={m} />,
  plant: ({ w, h, d, m }) => {
    const r = Math.min(w, d);
    return (
      <>
        <B geometry={CYLINDER} p={[0, h * 0.15, 0]} s={[r * 0.8, h * 0.3, r * 0.8]} m={POT} />
        <B geometry={ICO} p={[0, h * 0.55, 0]} s={[r * 1.8, h * 0.6, r * 1.8]} m={m} />
        <B geometry={ICO} p={[r * 0.15, h * 0.85, r * 0.05]} s={[r * 1.1, h * 0.35, r * 1.1]} m={m} />
      </>
    );
  },
  "water-cooler": ({ w, h, d }) => (
    <>
      <B p={[0, h * 0.35, 0]} s={[w, h * 0.7, d]} m={WHITE} />
      <B geometry={CYLINDER} p={[0, h * 0.85, 0]} s={[w * 0.8, h * 0.3, d * 0.8]} m={WATER} />
    </>
  ),
  kitchen: ({ w, h, d, m }) => (
    <>
      <B p={[0, (h - 0.04) / 2, 0]} s={[w, h - 0.04, d]} m={m} />
      <B p={[0, h - 0.02, 0]} s={[w + 0.02, 0.04, d + 0.02]} m={DARK} />
      <B p={[w * 0.2, h - 0.01, 0]} s={[0.5, 0.02, d * 0.6]} m={METAL} />
    </>
  ),
  "floor-lamp": ({ w, h, d, m }) => (
    <>
      <B geometry={CYLINDER} p={[0, 0.02, 0]} s={[w * 0.7, 0.04, d * 0.7]} m={m} />
      <B geometry={CYLINDER} p={[0, h * 0.45, 0]} s={[0.04, h * 0.9, 0.04]} m={m} />
      <B geometry={CYLINDER} p={[0, h * 0.92, 0]} s={[w, h * 0.16, d]} m={LAMP} />
    </>
  ),
  bookshelf: ({ w, h, d, m }) => {
    const shelves = Math.max(2, Math.round(h / 0.4));
    return (
      <>
        <B p={[0, h / 2, -d / 2 + 0.02]} s={[w, h, 0.04]} m={m} />
        {[-1, 1].map((sx) => (
          <B key={sx} p={[sx * (w / 2 - 0.02), h / 2, 0]} s={[0.04, h, d]} m={m} />
        ))}
        {Array.from({ length: shelves + 1 }).map((_, i) => (
          <B key={i} p={[0, (i * h) / shelves + 0.015, 0]} s={[w, 0.03, d]} m={m} />
        ))}
        {Array.from({ length: shelves }).map((_, i) => (
          <B key={`b${i}`} p={[((i % 3) - 1) * w * 0.15, (i * h) / shelves + h / shelves / 2.6, 0]} s={[w * 0.55, h / shelves / 1.6, d * 0.7]} m={BOOKS[i % BOOKS.length]!} />
        ))}
      </>
    );
  },
  cabinet: ({ w, h, d, m }) => (
    <>
      <B p={[0, h / 2, 0]} s={[w, h, d]} m={m} />
      <B p={[0, h / 2, d / 2 + 0.005]} s={[0.01, h - 0.08, 0.01]} m={DARK} />
      {[-1, 1].map((sx) => (
        <B key={sx} p={[sx * 0.06, h * 0.52, d / 2 + 0.02]} s={[0.02, 0.2, 0.03]} m={METAL} />
      ))}
    </>
  ),
  lockers: ({ w, h, d, m }) => {
    const cols = Math.max(1, Math.round(w / 0.4));
    return (
      <>
        <B p={[0, h / 2, 0]} s={[w, h, d]} m={m} />
        {Array.from({ length: cols - 1 }).map((_, i) => (
          <B key={i} p={[-w / 2 + ((i + 1) * w) / cols, h / 2, d / 2 + 0.005]} s={[0.015, h - 0.06, 0.01]} m={DARK} />
        ))}
        {Array.from({ length: cols }).map((_, i) => (
          <B key={`v${i}`} p={[-w / 2 + ((i + 0.5) * w) / cols, h * 0.85, d / 2 + 0.006]} s={[w / cols / 2, 0.03, 0.01]} m={DARK} />
        ))}
      </>
    );
  },
  shelving: ({ w, h, d, m }) => (
    <>
      {legs(w, d, h, 0.03, 0.05, METAL)}
      {[0.1, 0.4, 0.7, 0.98].map((t) => (
        <B key={t} p={[0, h * t, 0]} s={[w, 0.04, d]} m={m} />
      ))}
    </>
  ),
  pallet: ({ w, h, d, m }) => (
    <>
      {[-1, 0, 1].map((k) => (
        <B key={k} p={[0, h * 0.35, k * (d / 2 - 0.05)]} s={[w, h * 0.7, 0.1]} m={m} />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <B key={`s${i}`} p={[-w / 2 + 0.06 + (i * (w - 0.12)) / 4, h * 0.85, 0]} s={[0.12, h * 0.3, d]} m={m} />
      ))}
    </>
  ),
  crates: ({ w, h, d, m }) => (
    <>
      <B p={[-w * 0.02, h * 0.25, 0]} s={[w * 0.96, h * 0.48, d]} m={m} />
      <B p={[w * 0.04, h * 0.74, -d * 0.03]} s={[w * 0.88, h * 0.48, d * 0.92]} m={m} />
      <B p={[0, h * 0.25, d / 2 + 0.003]} s={[w * 0.9, 0.04, 0.01]} m={DARK} />
    </>
  ),
  workbench: ({ w, h, d, m }) => (
    <>
      <B p={[0, h - 0.04, 0]} s={[w, 0.08, d]} m={WOOD} />
      {legs(w, d, h - 0.08, 0.06, 0.07, m)}
      <B p={[0, 0.2, 0]} s={[w - 0.1, 0.03, d - 0.1]} m={m} />
    </>
  ),
  bin: ({ w, h, d, m }) => (
    <>
      <B geometry={CYLINDER} p={[0, h * 0.46, 0]} s={[w, h * 0.92, d]} m={m} />
      <B geometry={CYLINDER} p={[0, h * 0.96, 0]} s={[w * 1.04, h * 0.08, d * 1.04]} m={DARK} />
    </>
  ),
  extinguisher: ({ w, h, d, m }) => (
    <>
      <B geometry={CYLINDER} p={[0, h * 0.42, 0]} s={[w * 0.7, h * 0.8, d * 0.7]} m={m} />
      <B p={[0, h * 0.88, 0]} s={[w * 0.25, h * 0.12, d * 0.25]} m={DARK} />
      <B p={[w * 0.25, h * 0.86, 0]} s={[w * 0.5, 0.03, 0.03]} m={DARK} />
    </>
  ),
  barrier: ({ w, h, d, m }) => (
    <>
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <B p={[sx * (w / 2 - 0.05), h / 2, 0]} s={[0.08, h, 0.08]} m={DARK} />
          <B p={[sx * (w / 2 - 0.05), 0.02, 0]} s={[0.3, 0.04, d]} m={DARK} />
        </group>
      ))}
      {[0.55, 0.9].map((t) => (
        <B key={t} p={[0, h * t, 0]} s={[w - 0.1, 0.1, 0.05]} m={m} />
      ))}
    </>
  ),
  pillar: ({ w, h, d, m }) => <B p={[0, h / 2, 0]} s={[w, h, d]} m={m} />,
};

const noRaycast = () => null;

/** Un accessoire du plan : position, élévation, rotation, dimensions et couleur configurées. */
export function PropModel({ prop }: { prop: Prop }) {
  const ref = useRef<THREE.Group>(null);
  const [w, h, d] = prop.size;
  const m = standard(prop.color ?? PROP_CATALOG[prop.type].color, { roughness: 0.7 });
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.raycast = noRaycast;
    });
  });
  const Model = MODELS[prop.type];
  return (
    <group ref={ref} position={[prop.position[0], prop.elevation, prop.position[1]]} rotation-y={prop.rotationY}>
      {Model ? <Model w={w} h={h} d={d} m={m} /> : null}
    </group>
  );
}
