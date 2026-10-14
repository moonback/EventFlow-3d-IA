"use client";
import type { ThreeEvent } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { BOX, glow, standard, STATUS_COLORS } from "../materials/palette";
import type { SceneItem } from "@/features/scene/types";
import { useSceneMode } from "./scene-mode";
import { makeScreenTexture } from "./text-texture";

const FRAME = standard("#0f172a", { metalness: 0.6, roughness: 0.3 });
const STAND = standard("#475569", { metalness: 0.5 });

/** Écran d'indicateurs relié à un module (données réelles du tableau de bord). */
export function KpiScreen({ item, active }: { item: SceneItem; active: boolean }) {
  const router = useRouter();
  const { navigate } = useSceneMode();
  const color = STATUS_COLORS[item.status];
  const texture = useMemo(() => makeScreenTexture(item.label, item.metrics ?? [], color, item.chart), [item.label, item.metrics, color, item.chart]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group>
      <mesh geometry={BOX} material={STAND} position={[0, 0.9, 0]} scale={[0.15, 1.8, 0.15]} />
      <mesh geometry={BOX} material={FRAME} position={[0, 2.6, 0]} scale={[3.4, 2.2, 0.12]} />
      {/* Cliquer sur l'affichage ouvre directement la page du module ; le cadre et le pied sélectionnent l'écran */}
      <mesh
        position={[0, 2.6, 0.07]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!navigate) return;
          e.stopPropagation();
          document.body.style.cursor = "";
          router.push(item.href);
        }}
      >
        <planeGeometry args={[3.2, 2]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh geometry={BOX} position={[0, 3.75, 0]} scale={[3.4, 0.06, 0.14]}>
        <meshBasicMaterial color={glow(color, active ? 3 : 1.4)} toneMapped={false} />
      </mesh>
    </group>
  );
}
