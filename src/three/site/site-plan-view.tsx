"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { wallAngle, wallLength, wallPieces, type Vec2 } from "@/features/site-plan/geometry";
import type { FloorKind, SitePlan, Wall, WallMaterial } from "@/features/site-plan/schema";
import { BOX } from "../materials/palette";
import { PropModel } from "./props";

/**
 * Rendu 3D du plan du site : murs découpés autour des ouvertures, sols des pièces, toits et accessoires.
 * Vue en coupe : au-dessus du socle (1,2 m), les murs et les toits s'effacent quand la caméra descend,
 * pour voir l'intérieur ; en visite à pied, les murs redeviennent opaques. Purement décoratif.
 */
const PLINTH = 1.2;
const noRaycast = () => null;

export const WALL_COLORS: Record<WallMaterial, string> = { plaster: "#94a3b8", concrete: "#64748b", brick: "#9a3412", cladding: "#1e293b", glass: "#7dd3fc" };
export const FLOOR_COLORS: Record<FloorKind, string> = { concrete: "#3f4654", epoxy: "#2f5d73", tiles: "#8b95a5", parquet: "#7c5a3a", carpet: "#374151" };

type Materials = {
  lower: Record<WallMaterial, THREE.MeshStandardMaterial>;
  upper: Record<WallMaterial, THREE.MeshStandardMaterial>;
  glass: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  slats: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  floors: Record<FloorKind, THREE.MeshStandardMaterial>;
};

function useMaterials(night: number): Materials {
  const materials = useMemo<Materials>(() => {
    const per = <T,>(f: (m: WallMaterial) => T) => Object.fromEntries((Object.keys(WALL_COLORS) as WallMaterial[]).map((m) => [m, f(m)])) as Record<WallMaterial, T>;
    const glassLike = (m: WallMaterial) => m === "glass";
    return {
      lower: per((m) => new THREE.MeshStandardMaterial({ color: glassLike(m) ? "#334155" : WALL_COLORS[m], roughness: 0.85, metalness: m === "cladding" ? 0.3 : 0.05 })),
      upper: per((m) =>
        glassLike(m)
          ? new THREE.MeshStandardMaterial({ color: WALL_COLORS.glass, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.22, depthWrite: false })
          : new THREE.MeshStandardMaterial({ color: WALL_COLORS[m], roughness: 0.75, metalness: m === "cladding" ? 0.3 : 0.05, transparent: true, opacity: 0.85, depthWrite: false }),
      ),
      glass: new THREE.MeshStandardMaterial({ color: "#bae6fd", roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.3, depthWrite: false }),
      leaf: new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.5, metalness: 0.3 }),
      slats: new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.4, metalness: 0.5 }),
      roof: new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.4, metalness: 0.5, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
      floors: Object.fromEntries(
        (Object.keys(FLOOR_COLORS) as FloorKind[]).map((f) => [f, new THREE.MeshStandardMaterial({ color: FLOOR_COLORS[f], roughness: f === "epoxy" || f === "tiles" ? 0.35 : 0.9, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -1 })]),
      ) as Record<FloorKind, THREE.MeshStandardMaterial>,
    };
  }, []);
  useEffect(() => () => {
    for (const group of [materials.lower, materials.upper, materials.floors]) for (const m of Object.values(group)) m.dispose();
    for (const m of [materials.glass, materials.leaf, materials.slats, materials.roof]) m.dispose();
  }, [materials]);
  // La nuit, les vitrages s'éclairent d'une lumière chaude intérieure
  useEffect(() => {
    for (const m of [materials.upper.glass, materials.glass]) {
      m.emissive.set("#ffcf8a");
      m.emissiveIntensity = night * 0.8;
    }
  }, [night, materials]);
  return materials;
}

/** Opacité des parties hautes selon la hauteur de la caméra (opaque en visite à pied). */
function Cutaway({ materials, walk }: { materials: Materials; walk: boolean }) {
  const last = useRef(-1);
  useFrame(({ camera }) => {
    const t = walk ? 1 : Math.min(1, Math.max(0, (camera.position.y - 12) / 48));
    if (Math.abs(t - last.current) < 0.01) return;
    last.current = t;
    for (const [kind, m] of Object.entries(materials.upper) as [WallMaterial, THREE.MeshStandardMaterial][]) {
      m.opacity = kind === "glass" ? 0.15 + 0.15 * t : walk ? 1 : 0.18 + 0.67 * t;
      m.depthWrite = m.opacity > 0.99;
    }
    materials.roof.opacity = walk ? 0 : 0.45 * t;
    materials.roof.visible = !walk && t > 0.02;
  });
  return null;
}

function WallMesh({ wall, plan, materials }: { wall: Wall; plan: SitePlan; materials: Materials }) {
  const len = wallLength(wall);
  const t = wall.thickness;
  const pieces = useMemo(() => wallPieces(wall, plan.openings), [wall, plan.openings]);
  const cx = (wall.a[0] + wall.b[0]) / 2;
  const cz = (wall.a[1] + wall.b[1]) / 2;
  const boxes: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material }[] = [];
  for (const piece of pieces) {
    // Les parties pleines aux extrémités sont prolongées d'une demi-épaisseur pour fermer les angles
    const x0 = piece.kind === "solid" && piece.x0 < 1e-6 ? -t / 2 : piece.x0;
    const x1 = piece.kind === "solid" && piece.x1 > len - 1e-6 ? len + t / 2 : piece.x1;
    const mid = (x0 + x1) / 2 - len / 2;
    const width = x1 - x0;
    const box = (y0: number, y1: number, m: THREE.Material, depth = t) => {
      if (y1 - y0 > 1e-3) boxes.push({ p: [mid, (y0 + y1) / 2, 0], s: [width, y1 - y0, depth], m });
    };
    if (piece.kind === "solid") {
      box(piece.y0, Math.min(piece.y1, PLINTH), materials.lower[wall.material]);
      box(Math.max(piece.y0, PLINTH), piece.y1, materials.upper[wall.material], wall.material === "glass" ? Math.min(t, 0.08) : t);
    } else if (piece.kind === "glass") {
      box(piece.y0, piece.y1, materials.glass, Math.min(t, 0.04));
    } else if (piece.kind === "leaf") {
      // Vantail(aux) entrouvert(s) : un panneau fin, deux pour une porte double
      const leaves = piece.opening === "double-door" ? 2 : 1;
      const lw = (piece.x1 - piece.x0) / leaves;
      for (let i = 0; i < leaves; i++) boxes.push({ p: [piece.x0 + lw * (i + 0.5) - len / 2, (piece.y0 + piece.y1) / 2, 0], s: [lw - 0.04, piece.y1 - piece.y0 - 0.02, 0.05], m: materials.leaf });
    } else {
      // Porte sectionnelle à moitié relevée : lames dans le haut de l'ouverture
      const h = piece.y1 - piece.y0;
      for (let k = 0; k < 3; k++) boxes.push({ p: [mid, piece.y1 - 0.3 - k * (h / 8), 0], s: [width - 0.2, h / 9, 0.12], m: materials.slats });
    }
  }
  return (
    <group position={[cx, 0, cz]} rotation-y={wallAngle(wall)}>
      {boxes.map((b, i) => (
        <mesh key={i} geometry={BOX} material={b.m} position={b.p} scale={b.s} raycast={noRaycast} renderOrder={b.m === materials.lower[wall.material] || b.m === materials.leaf || b.m === materials.slats ? 0 : 1} />
      ))}
    </group>
  );
}

/** Polygone (x, z) → géométrie plane posée à la hauteur y (face vers le haut). */
function usePolygon(polygon: Vec2[]) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [polygon]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function RoomMesh({ room, materials }: { room: SitePlan["rooms"][number]; materials: Materials }) {
  const geometry = usePolygon(room.polygon);
  return (
    <>
      <mesh geometry={geometry} material={materials.floors[room.floor]} position-y={0.012} raycast={noRaycast} receiveShadow />
      {room.roofHeight ? <mesh geometry={geometry} material={materials.roof} position-y={room.roofHeight + 0.05} raycast={noRaycast} renderOrder={3} /> : null}
    </>
  );
}

export function SitePlanView({ plan, walk = false, night = 0 }: { plan: SitePlan; walk?: boolean; night?: number }) {
  const materials = useMaterials(night);
  return (
    <group>
      <Cutaway materials={materials} walk={walk} />
      {plan.rooms.map((r) => (
        <RoomMesh key={r.id} room={r} materials={materials} />
      ))}
      {plan.walls.map((w) => (
        <WallMesh key={w.id} wall={w} plan={plan} materials={materials} />
      ))}
      {plan.props.map((p) => (
        <PropModel key={p.id} prop={p} />
      ))}
    </group>
  );
}
