"use client";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import { useAnimation } from "../effects/motion";
import { glow, RING } from "../materials/palette";

/** Anneau au sol : pulsation douce (sélection, survol, mise en évidence). */
export function SelectionRing({ radius, color = "#a5b4fc", visible, opacity = 0.9, pulse = true }: { radius: number; color?: string; visible: boolean; opacity?: number; pulse?: boolean }) {
  const motion = useAnimation("pulses");
  const inner = useRef<THREE.Mesh>(null);
  const outer = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!motion || !pulse || !outer.current || !inner.current) return;
    const t = (clock.elapsedTime * 0.6) % 1;
    outer.current.scale.setScalar(radius * (1 + t * 0.45));
    (outer.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * opacity * 0.6;
    inner.current.rotation.z = clock.elapsedTime * 0.4;
  });
  if (!visible) return null;
  return (
    <group position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={inner} geometry={RING} scale={radius} renderOrder={2}>
        <meshBasicMaterial color={glow(color, 1.8)} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
      </mesh>
      {pulse ? (
        <mesh ref={outer} geometry={RING} scale={radius} renderOrder={2}>
          <meshBasicMaterial color={glow(color, 1.8)} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}
