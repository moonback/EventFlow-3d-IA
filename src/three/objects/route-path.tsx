"use client";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type * as THREE from "three";
import { zoneById } from "@/features/scene/layout";

type LineRef = THREE.Object3D & { material: { dashOffset: number } };

/**
 * Chemin « GPS » : de l'entrée de l'entrepôt (ouverture côté quais) jusqu'au rayonnage visé,
 * en suivant l'allée située devant lui. Tracé pointillé animé + balise pulsante sur la cible.
 */
export function RoutePath({ target }: { target: [number, number, number] }) {
  const lineRef = useRef<LineRef>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const reduceMotion = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  const points = useMemo(() => {
    const w = zoneById("WAREHOUSE");
    const halfX = w.size[0] / 2;
    const halfZ = w.size[1] / 2;
    const [tx, , tz] = target;
    const inside = Math.abs(tx - w.center[0]) < halfX && Math.abs(tz - w.center[1]) < halfZ;
    // Ouverture du mur est de l'entrepôt (vers la zone logistique)
    const doorX = w.center[0] + halfX;
    const doorZ = w.center[1]; // entrée principale (mur est)
    const y = 0.12;
    if (!inside) return [[doorX + 4, y, doorZ], [tx, y, tz]] as [number, number, number][];
    const aisleZ = tz + 3; // allée devant le rayonnage
    return [
      [doorX + 4, y, doorZ],
      [doorX - 2, y, doorZ],
      [doorX - 2, y, aisleZ],
      [tx, y, aisleZ],
      [tx, y, tz + 1],
    ] as [number, number, number][];
  }, [target]);

  useFrame((state, delta) => {
    if (reduceMotion) return;
    if (lineRef.current) lineRef.current.material.dashOffset -= delta * 3;
    if (beaconRef.current) {
      const s = 1 + ((state.clock.elapsedTime * 0.8) % 1) * 2.2;
      beaconRef.current.scale.setScalar(s);
      (beaconRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - (s - 1) / 2.2;
    }
    state.invalidate(); // la scène est rendue à la demande : on entretient l'animation tant que le chemin est affiché
  });

  return (
    <group>
      <Line ref={lineRef as never} points={points} color="#fbbf24" lineWidth={4} dashed dashSize={1.2} gapSize={0.7} transparent opacity={0.95} />
      <mesh position={[points[0]![0], 0.1, points[0]![2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 32]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      <mesh ref={beaconRef} position={[target[0], 0.08, target[2] + 1]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.15, 48]} />
        <meshBasicMaterial color="#fbbf24" transparent depthWrite={false} />
      </mesh>
      <mesh position={[target[0], 4.6, target[2]]}>
        <coneGeometry args={[0.45, 1, 4]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
    </group>
  );
}
