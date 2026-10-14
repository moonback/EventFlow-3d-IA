"use client";
import { useEffect, useMemo } from "react";
import type { SceneItem } from "@/features/scene/types";
import { BOX, standard, STATUS_COLORS } from "../materials/palette";
import { makeLabelTexture } from "./text-texture";

const TITLES: Partial<Record<SceneItem["kind"], string>> = {
  STOCK_LOCATION: "Stock bas",
  VEHICLE: "Échéance véhicule",
};

/**
 * Panneau d'alerte flottant au-dessus d'un objet (stock sous seuil, assurance / contrôle technique / entretien) :
 * titre, premier message et nombre d'alertes supplémentaires. Une tige le relie à l'objet.
 */
export function AlertMarker({ item, height }: { item: SceneItem; height: number }) {
  const alerts = item.alerts ?? [];
  const danger = alerts.some((a) => a.level === "danger");
  const color = danger ? STATUS_COLORS.danger : STATUS_COLORS.warning;
  const title = `${TITLES[item.kind] ?? "Alerte"}${alerts.length > 1 ? ` (${alerts.length})` : ""}`;
  const sub = alerts[0]?.message;
  const { texture, aspect } = useMemo(
    () => makeLabelTexture(`! ${title}`, { sub, accent: "#ffffff", background: danger ? "rgba(185,28,28,0.92)" : "rgba(180,83,9,0.92)" }),
    [title, sub, danger],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  if (alerts.length === 0) return null;
  const h = 1.1;
  const stem = standard(color, { emissive: color, emissiveIntensity: 0.6, glow: true });
  return (
    <group>
      <mesh geometry={BOX} material={stem} position={[0, height - 0.9, 0]} scale={[0.05, 1.2, 0.05]} />
      <sprite position={[0, height, 0]} scale={[h * aspect, h, 1]} renderOrder={11}>
        <spriteMaterial map={texture} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}
