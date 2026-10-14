"use client";
import type { ThreeEvent } from "@react-three/fiber";
import { forwardRef, type ReactNode } from "react";
import type * as THREE from "three";

export interface InteractiveProps {
  itemKey: string;
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
  onSelect: (key: string) => void;
  onHover: (key: string, hovering: boolean) => void;
  children: ReactNode;
}

/**
 * Groupe interactif : porte l'identité métier explicite (itemKey = type:identifiant),
 * jamais déduite de la position. Gère le survol (curseur) et la sélection.
 */
export const Interactive = forwardRef<THREE.Group, InteractiveProps>(function Interactive({ itemKey, position, rotationY = 0, scale = 1, onSelect, onHover, children }, ref) {
  return (
    <group
      ref={ref}
      name={itemKey}
      userData={{ key: itemKey }}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={scale}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(itemKey);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
        onHover(itemKey, true);
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
        onHover(itemKey, false);
      }}
    >
      {children}
    </group>
  );
});
