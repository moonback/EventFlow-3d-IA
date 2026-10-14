"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { makeLabelTexture } from "./text-texture";

const world = new THREE.Vector3();

/**
 * Étiquette toujours orientée vers la caméra (sprite + texture canvas). Masquée au-delà de
 * `maxDistance` pour alléger les vues éloignées (niveau de détail) et en deçà de `minDistance`.
 */
export function Label({ text, sub, position, height = 0.7, accent, dim = false, maxDistance = 85, minDistance = 3 }: { text: string; sub?: string; position: [number, number, number]; height?: number; accent?: string; dim?: boolean; maxDistance?: number; minDistance?: number }) {
  const { texture, aspect } = useMemo(() => makeLabelTexture(text, { sub, accent }), [text, sub, accent]);
  useEffect(() => () => texture.dispose(), [texture]);
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ camera }) => {
    const sprite = ref.current;
    if (!sprite) return;
    sprite.getWorldPosition(world);
    const d = camera.position.distanceTo(world);
    sprite.visible = d < maxDistance && d > minDistance; // trop près (visite à pied), l'étiquette masquerait la vue
  });
  const h = sub ? height * 1.5 : height;
  return (
    <sprite ref={ref} position={position} scale={[h * aspect, h, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthWrite={false} opacity={dim ? 0.55 : 1} />
    </sprite>
  );
}
