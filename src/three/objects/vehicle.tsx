"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { BOX, CYLINDER, glow, standard, STATUS_COLORS } from "../materials/palette";
import type { LoadingSimulation, SceneItem } from "@/features/scene/types";
import { Label } from "./label";
import { TruckLivery } from "./branding";
import { Model, NearFar } from "./models";

const WHEEL = standard("#111827", { roughness: 0.9 });
const GLASS = standard("#0ea5e9", { metalness: 0.8, roughness: 0.15, transparent: true, opacity: 0.55 });
const BODY = standard("#e5e7eb", { metalness: 0.3, roughness: 0.45 });
const BODY_OPEN = standard("#e5e7eb", { metalness: 0.3, roughness: 0.45, opacity: 0.18 });
const GAUGE_BG = standard("#1f2937", { roughness: 0.8 });
const BUMPER = standard("#374151", { metalness: 0.5, roughness: 0.5 });

/** Couleur du taux de chargement : vert, orange au-delà de 85 %, rouge en surcharge. */
export const loadColor = (ratio: number) => (ratio > 1 ? "#ef4444" : ratio > 0.85 ? "#f59e0b" : "#22c55e");

/** Version procédurale : caisse, bande d'état, cabine, pare-brise, roues (vue de loin et repli). */
function ProceduralBody({ len, boxH, status, open = false }: { len: number; boxH: number; status: THREE.Material; open?: boolean }) {
  return (
    <group>
      <mesh geometry={BOX} material={open ? BODY_OPEN : BODY} position={[-0.6, 0.55 + boxH / 2, 0]} scale={[len - 1.6, boxH, 2.1]} />
      <mesh geometry={BOX} material={status} position={[-0.6, 0.62, 0]} scale={[len - 1.55, 0.14, 2.14]} />
      <mesh geometry={BOX} material={BODY} position={[len / 2 - 0.6, 1.25, 0]} scale={[1.4, 1.5, 2]} />
      <mesh geometry={BOX} material={GLASS} position={[len / 2 + 0.12, 1.55, 0]} scale={[0.05, 0.7, 1.7]} />
      <mesh geometry={BOX} material={BUMPER} position={[len / 2 + 0.12, 0.55, 0]} scale={[0.12, 0.3, 2.05]} />
      {/* phares et feux arrière */}
      {[0.75, -0.75].map((z) => (
        <group key={z}>
          <mesh geometry={BOX} position={[len / 2 + 0.16, 0.85, z]} scale={[0.04, 0.18, 0.36]}>
            <meshBasicMaterial color={glow("#fef3c7", 2.2)} toneMapped={false} />
          </mesh>
          <mesh geometry={BOX} position={[-len / 2 + 0.18, 0.95, z * 1.2]} scale={[0.04, 0.3, 0.16]}>
            <meshBasicMaterial color={glow("#ef4444", 1.8)} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {[
        [len / 2 - 0.7, 1.05],
        [len / 2 - 0.7, -1.05],
        [-len / 2 + 0.9, 1.05],
        [-len / 2 + 0.9, -1.05],
      ].map(([x, z], i) => (
        <mesh key={i} geometry={CYLINDER} material={WHEEL} position={[x!, 0.42, z!]} rotation={[Math.PI / 2, 0, 0]} scale={[0.84, 0.3, 0.84]} />
      ))}
    </group>
  );
}

/** Bloc de chargement : glisse depuis l'arrière du véhicule jusqu'à sa place quand il apparaît. */
function SimBlock({ x, length, height, color, from, current }: { x: number; length: number; height: number; color: string; from: number; current: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(() => standard(color, { emissive: color, emissiveIntensity: current ? 0.6 : 0.2 }), [color, current]);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const dx = x - m.position.x;
    if (Math.abs(dx) < 0.005) return;
    m.position.x += dx * 0.12;
    state.invalidate();
  });
  return <mesh ref={ref} geometry={BOX} material={material} position={[from, 0.6 + height / 2, 0]} scale={[Math.max(0.05, length - 0.04), height, 1.9]} />;
}

/**
 * Simulation de chargement : chaque étape devient un bloc (longueur ∝ volume, couleur = catégorie),
 * placé du fond de la caisse (côté cabine) vers les portes, la dernière étape glissant depuis l'arrière.
 */
function LoadingBlocks({ simulation, cargoLen, boxH, capacity }: { simulation: LoadingSimulation; cargoLen: number; boxH: number; capacity: number | null }) {
  const vols = simulation.steps.map((s) => s.volume ?? 0.15);
  const total = vols.reduce((a, b) => a + b, 0);
  const usable = cargoLen * (capacity && simulation.steps.every((s) => s.volume !== null) ? Math.min(1, total / capacity) : 0.92);
  const front = -0.6 + cargoLen / 2; // côté cabine
  const rear = -0.6 - cargoLen / 2;
  let cursor = front;
  return (
    <group>
      {simulation.steps.slice(0, simulation.step).map((s, i) => {
        const length = (vols[i]! / total) * usable;
        const x = cursor - length / 2;
        cursor -= length;
        return <SimBlock key={s.step} x={x} length={length} height={boxH * 0.82} color={s.color ?? "#818cf8"} from={i === simulation.step - 1 ? rear - 2 : x} current={i === simulation.step - 1} />;
      })}
    </group>
  );
}

/** Véhicule (fourgon / porteur) : bande de couleur = statut opérationnel réel. */
export function Vehicle({ item, active, simulation }: { item: SceneItem; active: boolean; simulation?: LoadingSimulation | null }) {
  const truck = item.variant === "truck";
  const len = truck ? 6.4 : 4.8;
  const boxH = truck ? 2.6 : 2;
  const status = standard(STATUS_COLORS[item.status], { emissive: STATUS_COLORS[item.status], emissiveIntensity: active ? 0.6 : 0.25, glow: true });
  const load = item.load;
  const cargoLen = len - 1.6;
  const ratio = load ? Math.min(1, load.ratio) : 0;
  const cargo = load ? standard(loadColor(load.ratio), { emissive: loadColor(load.ratio), emissiveIntensity: 0.35 }) : null;
  const pct = load ? `${Math.round(load.ratio * 100)} %` : null;
  // Caisse ouverte (translucide) pour voir le chargement : véhicule sélectionné avec chargement connu
  const open = Boolean(simulation) || (active && Boolean(load));
  return (
    <group>
      {open ? (
        <ProceduralBody len={len} boxH={boxH} status={status} open />
      ) : (
        // Modèle détaillé de près (glTF), version procédurale de loin et en repli
        <NearFar distance={70} near={<Model name={truck ? "truck" : "van"} materials={{ status }} fallback={<ProceduralBody len={len} boxH={boxH} status={status} />} />} far={<ProceduralBody len={len} boxH={boxH} status={status} />} />
      )}
      {/* Livrée aux couleurs de l'agence (masquée quand la caisse est ouverte) */}
      {!open ? <TruckLivery x={-0.6} y={0.55 + boxH * 0.52} length={cargoLen * 0.94} height={boxH * 0.62} halfWidth={1.05} /> : null}
      {simulation ? <LoadingBlocks simulation={simulation} cargoLen={cargoLen} boxH={boxH} capacity={load?.capacity ?? null} /> : null}
      {cargo && active && ratio > 0 && !simulation ? (
        // Chargement rempli depuis le fond de la caisse (côté opposé à la cabine)
        <mesh geometry={BOX} material={cargo} position={[-0.6 - cargoLen / 2 + (cargoLen * ratio) / 2, 0.55 + (boxH * 0.85) / 2, 0]} scale={[cargoLen * ratio - 0.05, boxH * 0.85, 1.9]} />
      ) : null}
      {cargo ? (
        // Jauge de chargement sur le toit (visible de loin)
        <group position={[-0.6, 0.57 + boxH, 0]}>
          <mesh geometry={BOX} material={GAUGE_BG} scale={[cargoLen, 0.04, 0.5]} />
          {ratio > 0 ? <mesh geometry={BOX} material={cargo} position={[-cargoLen / 2 + (cargoLen * ratio) / 2, 0.03, 0]} scale={[cargoLen * ratio, 0.06, 0.5]} /> : null}
        </group>
      ) : null}
      <Label
        text={item.label}
        sub={active ? (pct ? `Chargement ${pct} · ${load!.event}` : item.sublabel) : [item.metrics?.[0]?.value, pct].filter(Boolean).join(" · ")}
        position={[0, boxH + 1.6, 0]}
        accent={STATUS_COLORS[item.status]}
      />
    </group>
  );
}

const CONCRETE = standard("#475569", { roughness: 0.95 });
const DOOR = standard("#1e293b", { metalness: 0.4 });
const STRIPE = standard("#facc15", { emissive: "#facc15", emissiveIntensity: 0.2 });
const STRIPE_ACTIVE = standard("#facc15", { emissive: "#facc15", emissiveIntensity: 1.2 });

export function Dock({ item, active }: { item: SceneItem; active: boolean }) {
  return (
    <group>
      <mesh geometry={BOX} material={CONCRETE} position={[0, 0.6, 0]} scale={[2.4, 1.2, 4.2]} />
      <mesh geometry={BOX} material={DOOR} position={[-1.2, 2.6, 0]} scale={[0.2, 3.2, 3.6]} />
      <mesh geometry={BOX} material={active ? STRIPE_ACTIVE : STRIPE} position={[1.25, 1.22, 0]} scale={[0.1, 0.05, 4.2]} />
      {/* auvent et éclairage de quai */}
      <mesh geometry={BOX} material={DOOR} position={[0.2, 4.35, 0]} scale={[3.2, 0.12, 4.4]} />
      <mesh geometry={BOX} position={[0.9, 4.26, 0]} scale={[0.12, 0.04, 3.6]}>
        <meshBasicMaterial color={glow("#fde68a", 2)} toneMapped={false} />
      </mesh>
      <Label text={item.label} position={[0, 4.8, 0]} accent="#facc15" />
    </group>
  );
}
