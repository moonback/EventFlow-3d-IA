"use client";
import { Grid, Line, Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ZONES } from "@/features/scene/layout";
import { useAnimation } from "../effects/motion";
import { BOX, CYLINDER, glow, standard } from "../materials/palette";
import { useAmbience } from "../materials/ambience";
import { BrandFloor, BrandSign } from "./branding";
import { Atmosphere } from "./atmosphere";
import { Exterior, SITE } from "./exterior";
import { WarehouseFleet } from "./warehouse-fleet";
import { makeLabelTexture } from "./text-texture";

const METAL = standard("#475569", { metalness: 0.7, roughness: 0.35 });
const DARK_METAL = standard("#111827", { metalness: 0.6, roughness: 0.4 });
const STAGE = standard("#0f172a", { metalness: 0.3, roughness: 0.55 });
const BUILDING = standard("#0d1322", { roughness: 0.95 });
const ICO = new THREE.IcosahedronGeometry(1, 1);
const CONE = new THREE.ConeGeometry(1, 1, 24, 1, true);

function ZoneTitle({ text, sub, position, color }: { text: string; sub: string; position: [number, number, number]; color: string }) {
  const { texture, aspect } = useMemo(() => makeLabelTexture(text, { sub, accent: color, background: "rgba(15,17,26,0.65)" }), [text, sub, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[2.4 * aspect, 2.4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/** Contour lumineux d'une zone + bornes aux angles. */
function ZoneOutline({ center, size, color }: { center: [number, number]; size: [number, number]; color: string }) {
  const [cx, cz] = center;
  const hw = size[0] / 2;
  const hd = size[1] / 2;
  const corners: [number, number][] = [
    [cx - hw, cz - hd],
    [cx + hw, cz - hd],
    [cx + hw, cz + hd],
    [cx - hw, cz + hd],
  ];
  const points = [...corners, corners[0]!].map(([x, z]) => new THREE.Vector3(x, 0.04, z));
  return (
    <group>
      <Line points={points} color={glow(color, 1.3)} lineWidth={1.6} transparent opacity={0.55} toneMapped={false} />
      {corners.map(([x, z], i) => (
        <mesh key={i} geometry={BOX} position={[x, 0.25, z]} scale={[0.35, 0.5, 0.35]}>
          <meshBasicMaterial color={glow(color, 2)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Hologramme central du centre de contrôle. */
function ControlHub({ position }: { position: [number, number, number] }) {
  const motion = useAnimation("decor");
  const core = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!motion) return;
    const t = clock.elapsedTime;
    if (core.current) {
      core.current.rotation.y = t * 0.35;
      core.current.rotation.x = Math.sin(t * 0.3) * 0.2;
    }
    if (rings.current) rings.current.rotation.y = -t * 0.5;
  });
  return (
    <group position={position}>
      <mesh geometry={CYLINDER} material={DARK_METAL} position={[0, 0.3, 0]} scale={[4.4, 0.6, 4.4]} />
      <mesh geometry={CYLINDER} position={[0, 0.62, 0]} scale={[3.6, 0.04, 3.6]}>
        <meshBasicMaterial color={glow("#ec4899", 1.4)} toneMapped={false} transparent opacity={0.35} />
      </mesh>
      <mesh ref={core} geometry={ICO} position={[0, 3, 0]} scale={1.3}>
        <meshBasicMaterial color={glow("#67e8f9", 1.6)} wireframe toneMapped={false} />
      </mesh>
      <mesh geometry={ICO} position={[0, 3, 0]} scale={0.6}>
        <meshBasicMaterial color={glow("#f0abfc", 2.5)} toneMapped={false} />
      </mesh>
      <group ref={rings} position={[0, 3, 0]}>
        {[2.1, 2.6].map((r, i) => (
          <mesh key={r} rotation={[Math.PI / 2 + (i ? 0.35 : -0.25), 0, 0]}>
            <torusGeometry args={[r, 0.03, 8, 64]} />
            <meshBasicMaterial color={glow(i ? "#ec4899" : "#67e8f9", 2)} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <mesh geometry={CONE} position={[0, 1.8, 0]} scale={[1.6, 2.4, 1.6]} rotation={[Math.PI, 0, 0]}>
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.08} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/** Scène de spectacle derrière la zone Événements : la vitrine du métier. */
function EventStage({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const motion = useAnimation("decor");
  const beams = useRef<THREE.Group>(null);
  const colors = ["#10b981", "#38bdf8", "#f472b6", "#fbbf24"];
  useFrame(({ clock }) => {
    if (!motion || !beams.current) return;
    const t = clock.elapsedTime;
    beams.current.children.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.7 + i * 1.3) * 0.35;
      b.rotation.x = 0.35 + Math.cos(t * 0.5 + i) * 0.15;
    });
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh geometry={BOX} material={STAGE} position={[0, 0.5, 0]} scale={[22, 1, 7]} />
      <mesh geometry={BOX} position={[0, 1.01, -3.45]} scale={[22, 0.02, 0.1]}>
        <meshBasicMaterial color={glow("#10b981", 2.2)} toneMapped={false} />
      </mesh>
      {/* écran LED de fond */}
      <mesh geometry={BOX} material={DARK_METAL} position={[0, 4.5, 3.2]} scale={[16, 7, 0.3]} />
      <mesh position={[0, 4.5, 3.04]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[15.4, 6.4]} />
        <meshBasicMaterial color={glow("#0e7490", 0.9)} toneMapped={false} />
      </mesh>
      {/* structure en truss */}
      {[-10.5, 10.5].map((x) => (
        <mesh key={x} geometry={BOX} material={METAL} position={[x, 5, 0]} scale={[0.4, 9, 0.4]} />
      ))}
      <mesh geometry={BOX} material={METAL} position={[0, 9.3, 0]} scale={[21.4, 0.4, 0.4]} />
      <group ref={beams}>
        {colors.map((c, i) => (
          <group key={c} position={[-7.5 + i * 5, 9, 0]} rotation={[0.35, 0, 0]}>
            <mesh geometry={CYLINDER} material={DARK_METAL} scale={[0.5, 0.6, 0.5]} />
            <mesh geometry={CONE} position={[0, -4.5, 0]} scale={[1.8, 9, 1.8]}>
              <meshBasicMaterial color={glow(c, 1.2)} transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Silhouette de ville au loin (instanciée, déterministe) avec fenêtres éclairées. */
function Skyline() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const windows = useRef<THREE.InstancedMesh>(null);
  const count = 70;
  useLayoutEffect(() => {
    const m = new THREE.Object3D();
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let w = 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.05;
      const r = 190 + rand() * 50;
      const h = 12 + rand() * 40;
      const sx = 6 + rand() * 8;
      const sz = 6 + rand() * 8;
      m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      m.rotation.set(0, -a, 0);
      m.scale.set(sx, h, sz);
      m.updateMatrix();
      ref.current?.setMatrixAt(i, m.matrix);
      // bande de fenêtres sur la face tournée vers l'agence
      const lit = Math.floor(rand() * 4);
      for (let k = 0; k < 4 && w < count * 4; k++, w++) {
        const on = k < lit;
        m.position.set(Math.cos(a) * (r - sx / 2 - 0.05), 3 + (k * (h - 4)) / 4, Math.sin(a) * (r - sx / 2 - 0.05));
        m.scale.set(0.05, on ? 0.6 : 0, sz * 0.7);
        m.updateMatrix();
        windows.current?.setMatrixAt(w, m.matrix);
      }
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (windows.current) windows.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <instancedMesh ref={ref} args={[BOX, BUILDING, count]} frustumCulled={false} />
      <instancedMesh ref={windows} args={[BOX, undefined, count * 4]} frustumCulled={false}>
        <meshBasicMaterial color={glow("#fbbf24", 0.9)} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Décor : abords, zones, habillage (purement visuel, non interactif). Les bâtiments et le mobilier viennent du plan du site. */
export function WorldEnvironment({ realLights = false, movementsToday = 0 }: { realLights?: boolean; movementsToday?: number }) {
  const a = useAmbience();
  return (
    <group>
      {/* Ciel étoilé la nuit, silhouette de ville au loin */}
      {(a?.night ?? 1) > 0.5 ? <Stars radius={320} depth={60} count={1800} factor={5} saturation={0} fade speed={0.4} /> : null}
      <Skyline />
      {/* Ciel, nuages, vent, oiseaux, piétons et circulation */}
      <Atmosphere />
      <Exterior realLights={realLights} />
      <Grid
        position={[(SITE.x0 + SITE.x1) / 2, 0.002, (SITE.z0 + SITE.z1) / 2]}
        args={[SITE.x1 - SITE.x0, SITE.z1 - SITE.z0]}
        cellSize={2}
        cellThickness={0.5}
        cellColor={a?.gridCell ?? "#1e293b"}
        sectionSize={10}
        sectionThickness={1}
        sectionColor={a?.gridSection ?? "#273449"}
        fadeDistance={160}
        fadeStrength={1.5}
        infiniteGrid={false}
      />
      {ZONES.map((z) => (
        <group key={z.id}>
          <mesh position={[z.center[0], 0.005, z.center[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={z.size} />
            <meshStandardMaterial color={z.color} transparent opacity={0.07} />
          </mesh>
          <ZoneOutline center={z.center} size={z.size} color={z.color} />
          <ZoneTitle text={z.label} sub={z.description} color={z.color} position={[z.center[0], 0.02, z.center[1] - z.size[1] / 2 + 1.8]} />
        </group>
      ))}
      {/* Habillage aux couleurs de l'agence : enseignes (lumineuses la nuit) et logo au sol du parvis */}
      <BrandSign position={[22.2, 5.5, 0]} rotationY={Math.PI / 2} width={9} />
      <BrandSign position={[0, 5.5, 17.2]} width={10} />
      <BrandSign position={[-38, 4.35, -11.8]} width={8} />
      <BrandFloor position={[0, 0.03, 21.3]} size={6} />
      {/* Chariots élévateurs et transpalette : en circulation s'il y a de l'activité aujourd'hui */}
      <WarehouseFleet movementsToday={movementsToday} />
      {/* Hologramme du centre de contrôle et scène de spectacle face à la frise des événements */}
      <ControlHub position={[-38, 0, 8]} />
      <EventStage position={[-45, 0, 36]} rotationY={-Math.PI / 2} />
    </group>
  );
}
