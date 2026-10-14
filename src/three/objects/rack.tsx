"use client";
import { Detailed } from "@react-three/drei";
import { BOX, standard } from "../materials/palette";
import { STATUS_COLORS } from "../materials/palette";
import type { SceneItem } from "@/features/scene/types";
import { Label } from "./label";
import { Model } from "./models";

const POST = standard("#94a3b8", { metalness: 0.6, roughness: 0.4 });
const SHELF = standard("#334155", { metalness: 0.3, roughness: 0.6 });
/** Distance (m) au-delà de laquelle les rayonnages et palettes passent en version simplifiée. */
const LOD_DISTANCE = 75;

/** Rayonnage : 4 montants, 3 niveaux ; les caisses représentent le taux de remplissage réel. */
export function Rack({ item, active, highlighted }: { item: SceneItem; active: boolean; highlighted: boolean }) {
  const fill = item.fill ?? 0;
  const levels = [0.25, 1.25, 2.25];
  const slots = 4;
  const filled = Math.round(fill * levels.length * slots);
  const crate = standard(STATUS_COLORS[item.status], { emissive: highlighted ? "#fbbf24" : STATUS_COLORS[item.status], emissiveIntensity: highlighted ? 0.9 : active ? 0.35 : 0.08 });
  return (
    <group>
      <Detailed distances={[0, LOD_DISTANCE]}>
        {/* Détaillé : montants, tablettes, une caisse par emplacement rempli */}
        <group>
          {[
            [-2, -0.6],
            [2, -0.6],
            [-2, 0.6],
            [2, 0.6],
          ].map(([x, z], i) => (
            <mesh key={i} geometry={BOX} material={POST} position={[x!, 1.6, z!]} scale={[0.1, 3.2, 0.1]} />
          ))}
          {levels.map((y, li) => (
            <group key={li}>
              <mesh geometry={BOX} material={SHELF} position={[0, y, 0]} scale={[4.1, 0.08, 1.3]} />
              {Array.from({ length: slots }).map((_, si) => {
                const idx = li * slots + si;
                if (idx >= filled) return null;
                return <mesh key={si} geometry={BOX} material={crate} position={[-1.45 + si * 0.97, y + 0.38, 0]} scale={[0.85, 0.66, 1]} />;
              })}
            </group>
          ))}
        </group>
        {/* Simplifié : un bloc de rayonnage + un bloc de remplissage */}
        <group>
          <mesh geometry={BOX} material={SHELF} position={[0, 1.6, 0]} scale={[4.1, 3.2, 1.3]} />
          {fill > 0 ? <mesh geometry={BOX} material={crate} position={[0, (3.2 * fill) / 2 + 0.02, 0]} scale={[4.15, 3.2 * fill, 1.35]} /> : null}
        </group>
      </Detailed>
      <Label text={item.label} sub={active ? item.sublabel : undefined} position={[0, 3.9, 0]} accent={STATUS_COLORS[item.status]} />
    </group>
  );
}

const AREA_COLORS: Record<string, string> = {
  "area-preparation": "#f59e0b",
  "area-return": "#8b5cf6",
  "area-quarantine": "#ef4444",
  "area-maintenance": "#f97316",
  "area-zone": "#64748b",
};

/** Zone au sol (préparation, retour, quarantaine, atelier) avec palettes. */
export function Area({ item, active, highlighted }: { item: SceneItem; active: boolean; highlighted: boolean }) {
  const color = AREA_COLORS[item.variant ?? ""] ?? "#64748b";
  const units = Number(item.metrics?.find((m) => m.label === "Unités")?.value ?? 0);
  const pallets = Math.min(6, Math.ceil(units / 15));
  const floor = standard(color, { transparent: true, opacity: 0.28, emissive: color, emissiveIntensity: active || highlighted ? 0.5 : 0.15 });
  const pallet = standard("#a16207", { roughness: 0.9 });
  const load = standard(color, { emissive: color, emissiveIntensity: 0.15 });
  return (
    <group>
      <mesh geometry={BOX} material={floor} position={[0, 0.02, 0]} scale={[7.5, 0.04, 5]} />
      <Detailed distances={[0, LOD_DISTANCE]}>
        <group>
          {Array.from({ length: pallets }).map((_, i) => (
            <group key={i} position={[-2.5 + (i % 3) * 2.5, 0, -1.2 + Math.floor(i / 3) * 2.4]}>
              <mesh geometry={BOX} material={pallet} position={[0, 0.08, 0]} scale={[1.6, 0.16, 1.4]} />
              {item.variant === "area-preparation" ? (
                // Zone de préparation : flight cases prêts à partir
                <group position={[0, 0.16, 0]}>
                  <Model name="flightcase" fallback={<mesh geometry={BOX} material={load} position={[0, 0.4, 0]} scale={[1.4, 0.8, 1.2]} />} />
                </group>
              ) : (
                <mesh geometry={BOX} material={load} position={[0, 0.55, 0]} scale={[1.4, 0.8, 1.2]} />
              )}
            </group>
          ))}
        </group>
        <group>{pallets > 0 ? <mesh geometry={BOX} material={load} position={[0, 0.48, (pallets > 3 ? 0 : -1.2)]} scale={[6.4, 0.95, pallets > 3 ? 3.8 : 1.4]} /> : null}</group>
      </Detailed>
      <Label text={item.label} sub={item.sublabel} position={[0, 2.2, 0]} accent={color} />
    </group>
  );
}
