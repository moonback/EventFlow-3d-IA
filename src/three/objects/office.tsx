"use client";
import type { SceneItem } from "@/features/scene/types";
import { BOX, CYLINDER, standard } from "../materials/palette";
import { Label } from "./label";

const TOP = standard("#e2e8f0", { roughness: 0.5 });
const LEG = standard("#334155", { metalness: 0.6, roughness: 0.4 });
const SCREEN = standard("#0f172a", { metalness: 0.5, roughness: 0.25 });
const SCREEN_ON = standard("#1d4ed8", { emissive: "#3b82f6", emissiveIntensity: 0.6 });
const CHAIR = standard("#1f2937", { roughness: 0.8 });

/** Poste de travail d'un collaborateur : bureau, double écran, chaise, plaque nominative et pastille d'état. */
const SKIN = standard("#e0b48a", { roughness: 0.8 });
const SHIRT = standard("#334155", { roughness: 0.8 });
const DESK_STATE = {
  available: { color: "#22c55e", text: "Au bureau" },
  mission: { color: "#38bdf8", text: "En mission" },
  leave: { color: "#94a3b8", text: "Absent" },
} as const;

export function StaffDesk({ item, active }: { item: SceneItem; active: boolean }) {
  const state = item.desk?.state ?? "available";
  const color = DESK_STATE[state].color;
  const glow = standard(color, { emissive: color, emissiveIntensity: state === "leave" ? 0.15 : 0.8, glow: state !== "leave", transparent: state !== "available", opacity: state === "available" ? 1 : 0.75 });
  const situation = item.desk?.detail ? `${DESK_STATE[state].text} · ${item.desk.detail}` : DESK_STATE[state].text;
  return (
    <group>
      <mesh geometry={BOX} material={TOP} position={[0, 0.74, 0]} scale={[1.8, 0.06, 0.9]} />
      {[-0.82, 0.82].map((x) => (
        <mesh key={x} geometry={BOX} material={LEG} position={[x, 0.37, 0]} scale={[0.05, 0.74, 0.8]} />
      ))}
      {[-0.36, 0.36].map((x) => (
        <group key={x} position={[x, 0, -0.28]}>
          <mesh geometry={BOX} material={SCREEN} position={[0, 1.08, 0]} scale={[0.66, 0.42, 0.04]} />
          <mesh geometry={BOX} material={SCREEN_ON} position={[0, 1.08, 0.025]} scale={[0.6, 0.36, 0.01]} />
          <mesh geometry={BOX} material={LEG} position={[0, 0.84, 0]} scale={[0.05, 0.16, 0.05]} />
        </group>
      ))}
      <mesh geometry={CYLINDER} material={CHAIR} position={[0, 0.45, 0.75]} scale={[0.55, 0.12, 0.55]} />
      <mesh geometry={BOX} material={CHAIR} position={[0, 0.85, 1.0]} scale={[0.5, 0.7, 0.08]} />
      <mesh geometry={CYLINDER} material={LEG} position={[0, 0.22, 0.75]} scale={[0.08, 0.44, 0.08]} />
      {/* Collaborateur assis quand il est au bureau */}
      {state === "available" ? (
        <group position={[0, 0, 0.78]}>
          <mesh geometry={CYLINDER} material={SHIRT} position={[0, 0.85, 0]} scale={[0.42, 0.6, 0.3]} />
          <mesh material={SKIN} position={[0, 1.3, 0]}>
            <sphereGeometry args={[0.15, 16, 12]} />
          </mesh>
        </group>
      ) : null}
      {/* Pastille d'état au-dessus de la chaise : vert au bureau, bleu en mission, gris absent */}
      <mesh position={[0, 1.75, 0.78]} material={glow}>
        <sphereGeometry args={[0.16, 16, 16]} />
      </mesh>
      <Label text={item.label} sub={active ? `${item.sublabel ? `${item.sublabel} · ` : ""}${situation}` : state === "available" ? undefined : situation} position={[0, 2.25, 0]} height={0.45} accent={color} />
      {item.variant ? <Label text={`${item.variant} collaborateurs`} position={[0, 3, 0]} height={0.35} dim /> : null}
    </group>
  );
}
