"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BOX, standard } from "../materials/palette";
import { useAmbience } from "../materials/ambience";
import { applyWind } from "./atmosphere";

const noRaycast = () => null;

/** Emprise du site goudronné (x, z) : au-delà, pelouse et arbres. */
export const SITE = { x0: -66, x1: 60, z0: -40, z1: 54 } as const;

/** Générateur pseudo-aléatoire déterministe (même décor à chaque chargement). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colored(geometry: THREE.BufferGeometry, color: string) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.getAttribute("position").count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute("uv");
  return g;
}

/** Arbres autour du site : tronc + houppier fusionnés, un seul InstancedMesh (un seul appel de dessin). */
function Trees() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { geometry, material, matrices } = useMemo(() => {
    const trunk = colored(new THREE.CylinderGeometry(0.18, 0.26, 2.2, 7).translate(0, 1.1, 0), "#5b3a1e");
    const crown = colored(new THREE.IcosahedronGeometry(1.6, 0).translate(0, 3.3, 0), "#2f6b3a");
    const crown2 = colored(new THREE.IcosahedronGeometry(1.1, 0).translate(0.5, 4.4, 0.2), "#3b7d45");
    const geometry = mergeGeometries([trunk, crown, crown2])!;
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    applyWind(material, 2); // le houppier ploie au vent, le tronc reste fixe
    const rand = rng(42);
    const matrices: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    // Bande de 4 à 28 m autour du site, en évitant les deux accès routiers (nord et est)
    for (let i = 0; i < 520 && matrices.length < 170; i++) {
      const x = SITE.x0 - 28 + rand() * (SITE.x1 - SITE.x0 + 56);
      const z = SITE.z0 - 28 + rand() * (SITE.z1 - SITE.z0 + 56);
      const inside = x > SITE.x0 - 4 && x < SITE.x1 + 4 && z > SITE.z0 - 4 && z < SITE.z1 + 4;
      const onRoad = (Math.abs(x - 48) < 7 && (z < SITE.z0 || z > SITE.z1)) || (Math.abs(z + 37) < 5 && x > SITE.x1);
      if (inside || onRoad) continue;
      const s = 0.7 + rand() * 0.7;
      m.compose(new THREE.Vector3(x, 0, z), q.setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, 0)), new THREE.Vector3(s, s * (0.85 + rand() * 0.3), s));
      matrices.push(m.clone());
    }
    return { geometry, material, matrices };
  }, []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} raycast={noRaycast} />;
}

/** Voitures du personnel garées sur le parking (un seul InstancedMesh, couleurs par instance). */
function ParkedCars() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const slots = useMemo(() => {
    const rand = rng(7);
    return Array.from({ length: 10 }, (_, i) => i)
      .filter(() => rand() > 0.35)
      .map((i) => ({ z: -32.7 + i * 2.6, color: ["#94a3b8", "#1e293b", "#b91c1c", "#f8fafc", "#1d4ed8", "#475569"][Math.floor(rand() * 6)]! }));
  }, []);
  const geometry = useMemo(() => {
    const body = new THREE.BoxGeometry(4.2, 0.7, 1.8).translate(0, 0.55, 0);
    const cabin = new THREE.BoxGeometry(2.2, 0.6, 1.6).translate(-0.2, 1.2, 0);
    return mergeGeometries([body.toNonIndexed(), cabin.toNonIndexed()])!;
  }, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.4 }), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    slots.forEach((s, i) => {
      mesh.setMatrixAt(i, m.makeTranslation(-61.5, 0, s.z));
      mesh.setColorAt(i, new THREE.Color(s.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [slots]);
  return <instancedMesh ref={ref} args={[geometry, material, slots.length]} raycast={noRaycast} />;
}

const POLE = standard("#64748b", { metalness: 0.7, roughness: 0.35 });

export const STREETLIGHTS: [number, number][] = [
  ...[-32, -16, 0, 16, 32, 48].map((z) => [53.2, z] as [number, number]),
  ...[-52, -32, -12, 8, 28].map((x) => [x, -34.6] as [number, number]),
  [-55.5, -28],
  [-55.5, -12],
];

/** Lampadaires : tête lumineuse allumée la nuit ; les plus proches éclairent réellement (qualité ≥ moyenne). */
function Streetlights({ night, realLights }: { night: number; realLights: boolean }) {
  const level = Math.round(night * 10) / 10;
  const head = standard("#fde68a", { emissive: "#fbbf24", emissiveIntensity: 0.05 + level * 1.6, glow: true });
  return (
    <group>
      {STREETLIGHTS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh geometry={BOX} material={POLE} position={[0, 3, 0]} scale={[0.14, 6, 0.14]} raycast={noRaycast} />
          <mesh geometry={BOX} material={POLE} position={[x > 50 ? -0.7 : 0, 6, x > 50 ? 0 : 0.7]} scale={x > 50 ? [1.4, 0.1, 0.12] : [0.12, 0.1, 1.4]} raycast={noRaycast} />
          <mesh geometry={BOX} material={head} position={[x > 50 ? -1.3 : 0, 5.9, x > 50 ? 0 : 1.3]} scale={[0.5, 0.12, 0.5]} raycast={noRaycast} />
          {realLights && level > 0.4 && i % 2 === 0 ? <pointLight position={[x > 50 ? -1.3 : 0, 5.6, x > 50 ? 0 : 1.3]} color="#ffd38a" intensity={25 * level} distance={22} decay={2} /> : null}
        </group>
      ))}
    </group>
  );
}

/** Néons du plafond de l'entrepôt : visibles à travers la toiture, plus intenses la nuit. */
function WarehouseNeons({ night }: { night: number }) {
  const level = Math.round(night * 10) / 10;
  const neon = standard("#f8fafc", { emissive: "#e0f2fe", emissiveIntensity: 0.2 + level * 0.5, glow: true });
  return (
    <group>
      {[-12, -4, 4, 12].map((z) => (
        <mesh key={z} geometry={BOX} material={neon} position={[0, 6.55, z]} scale={[40, 0.08, 0.25]} raycast={noRaycast} />
      ))}
    </group>
  );
}

/**
 * Abords du site : pelouse, dalle goudronnée, voiries avec marquages, parking du personnel,
 * trottoirs autour des bâtiments, arbres, lampadaires et néons.
 */
export function Exterior({ realLights }: { realLights: boolean }) {
  const a = useAmbience();
  const night = a?.night ?? 0.7;
  const asphalt = standard(a?.asphalt ?? "#1c2333", { roughness: 0.95 });
  const road = standard(a ? `#${new THREE.Color(a.asphalt).multiplyScalar(0.8).getHexString()}` : "#161c29", { roughness: 1 });
  const sidewalk = standard(a?.sidewalk ?? "#2b3448", { roughness: 0.9 });
  const mark = standard("#e2e8f0", { emissive: "#e2e8f0", emissiveIntensity: 0.1 });
  const w = SITE.x1 - SITE.x0;
  const d = SITE.z1 - SITE.z0;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[520, 520]} />
        <meshStandardMaterial color={a?.lawn ?? "#16301e"} roughness={1} />
      </mesh>
      <mesh geometry={BOX} material={asphalt} position={[(SITE.x0 + SITE.x1) / 2, -0.02, (SITE.z0 + SITE.z1) / 2]} scale={[w, 0.02, d]} raycast={noRaycast} />
      {/* Voie logistique nord-sud prolongée jusqu'aux accès, et voie d'accès nord vers le parking */}
      <mesh geometry={BOX} material={road} position={[48, 0.005, (SITE.z0 + SITE.z1) / 2]} scale={[8, 0.02, d + 60]} raycast={noRaycast} />
      {Array.from({ length: 30 }).map((_, i) => (
        <mesh key={i} geometry={BOX} material={mark} position={[48, 0.02, SITE.z0 - 28 + i * 5.2]} scale={[0.2, 0.02, 2]} raycast={noRaycast} />
      ))}
      <mesh geometry={BOX} material={road} position={[(SITE.x0 + 52) / 2 + 20, 0.006, -37]} scale={[52 - SITE.x0 + 40, 0.02, 6]} raycast={noRaycast} />
      {Array.from({ length: 28 }).map((_, i) => (
        <mesh key={i} geometry={BOX} material={mark} position={[SITE.x0 + 2 + i * 5.2, 0.021, -37]} scale={[2, 0.02, 0.18]} raycast={noRaycast} />
      ))}
      {/* Parking du personnel (marquages au sol) */}
      {Array.from({ length: 11 }).map((_, i) => (
        <mesh key={i} geometry={BOX} material={mark} position={[-61.5, 0.012, -34 + i * 2.6]} scale={[5, 0.02, 0.12]} raycast={noRaycast} />
      ))}
      <mesh geometry={BOX} material={mark} position={[-59, 0.012, -21]} scale={[0.12, 0.02, 26]} raycast={noRaycast} />
      <ParkedCars />
      {/* Trottoirs autour de l'entrepôt et des bureaux */}
      {[
        { c: [0, 0], s: [44, 34] },
        { c: [-38, -22], s: [26, 20] },
      ].flatMap((b, bi) => {
        const [cx, cz] = b.c as [number, number];
        const [bw, bd] = b.s as [number, number];
        return [
          [cx, cz - bd / 2 - 0.85, bw + 3.4, 1.6],
          [cx, cz + bd / 2 + 0.85, bw + 3.4, 1.6],
          [cx - bw / 2 - 0.85, cz, 1.6, bd],
          [cx + bw / 2 + 0.85, cz, 1.6, bd],
        ].map(([x, z, sx, sz], i) => <mesh key={`${bi}-${i}`} geometry={BOX} material={sidewalk} position={[x!, 0.012, z!]} scale={[sx!, 0.024, sz!]} raycast={noRaycast} />);
      })}
      <Trees />
      <Streetlights night={night} realLights={realLights} />
      <WarehouseNeons night={night} />
    </group>
  );
}
