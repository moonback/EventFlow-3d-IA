"use client";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useAnimation } from "../effects/motion";
import { glow, RING } from "../materials/palette";

const GEM = new THREE.OctahedronGeometry(0.42, 0);
const BEAM = new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true);

/**
 * Balise flottante au-dessus des objets en alerte ou à surveiller : repérables
 * depuis la vue d'ensemble, sans ouvrir aucune page.
 */
export function StatusBeacon({ color, top, radius, urgent }: { color: string; top: number; radius: number; urgent: boolean }) {
  const motion = useAnimation("beacons");
  const gem = useRef<THREE.Mesh>(null);
  const ripple = useRef<THREE.Mesh>(null);
  const phase = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!motion) return;
    const t = clock.elapsedTime + phase.current;
    if (gem.current) {
      gem.current.position.y = top + Math.sin(t * 2) * 0.18;
      gem.current.rotation.y = t * 1.4;
    }
    if (ripple.current) {
      const k = (t * (urgent ? 0.9 : 0.5)) % 1;
      ripple.current.scale.setScalar(radius * (0.6 + k * 0.9));
      (ripple.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55;
    }
  });
  return (
    <group>
      <mesh ref={gem} geometry={GEM} position={[0, top, 0]}>
        <meshBasicMaterial color={glow(color, urgent ? 4 : 2.6)} toneMapped={false} />
      </mesh>
      <mesh geometry={BEAM} position={[0, top / 2, 0]} scale={[1, top, 1]}>
        <meshBasicMaterial color={glow(color, 1.6)} transparent opacity={0.25} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={ripple} geometry={RING} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={radius} visible={motion}>
        <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
