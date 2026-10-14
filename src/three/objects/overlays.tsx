"use client";
import { QuadraticBezierLine } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { SceneItem } from "@/features/scene/types";
import { useLightAnimation } from "../effects/motion";
import { RING } from "../materials/palette";
import { Label } from "./label";

const noRaycast = () => null;

// ── Carte de chaleur des sorties ─────────────────────────────────────

const HEAT_STOPS = ["#1e3a8a", "#0891b2", "#facc15", "#f97316", "#dc2626"].map((c) => new THREE.Color(c));

/** Couleur d'intensité (0 = bleu froid, 1 = rouge). */
export function heatColor(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(x));
  return `#${HEAT_STOPS[i]!.clone().lerp(HEAT_STOPS[i + 1]!, x - i).getHexString()}`;
}

/** Dalles colorées au sol sous chaque emplacement selon les sorties des 90 derniers jours. */
export function HeatTiles({ items }: { items: SceneItem[] }) {
  return (
    <group>
      {items
        .filter((i) => i.kind === "STOCK_LOCATION" && i.heat !== undefined)
        .map((i) => {
          const rack = i.variant === "rack";
          const heat = i.heat ?? 0;
          return (
            <group key={i.key} position={i.position} rotation={[0, i.rotationY, 0]} scale={i.scale}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} raycast={noRaycast} renderOrder={2}>
                <planeGeometry args={rack ? [5.2, 2.8] : [8.2, 5.6]} />
                <meshBasicMaterial color={heatColor(heat)} transparent opacity={0.3 + heat * 0.5} depthWrite={false} />
              </mesh>
              {(i.outflow ?? 0) > 0 ? <Label text={`${i.outflow} sorties`} position={[0, rack ? 4.8 : 3.4, 0]} height={0.5} accent={heatColor(heat)} /> : null}
            </group>
          );
        })}
    </group>
  );
}

// ── Inventaire tournant ──────────────────────────────────────────────

function PulseRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const still = !useLightAnimation("pulses");
  useFrame((state) => {
    if (still || !ref.current) return;
    const s = 3 + Math.sin(state.clock.elapsedTime * 3) * 0.35;
    ref.current.scale.setScalar(s);
    state.invalidate();
  });
  return (
    <mesh ref={ref} geometry={RING} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} scale={3} raycast={noRaycast}>
      <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

/** Emplacements du comptage du jour : anneau orange pulsant à compter, vert une fois compté. */
export function CountMarkers({ items }: { items: SceneItem[] }) {
  return (
    <group>
      {items
        .filter((i) => i.count?.today)
        .map((i) => (
          <group key={i.key} position={i.position} scale={i.scale}>
            {i.count!.done ? (
              <mesh geometry={RING} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} scale={3} raycast={noRaycast}>
                <meshBasicMaterial color="#22c55e" transparent opacity={0.9} depthWrite={false} />
              </mesh>
            ) : (
              <PulseRing color="#f59e0b" />
            )}
            <Label text={i.count!.done ? "Compté" : "À compter"} position={[0, 4.8, 0]} height={0.6} accent={i.count!.done ? "#22c55e" : "#f59e0b"} />
          </group>
        ))}
    </group>
  );
}

// ── Liens événement ↔ ressources ─────────────────────────────────────

const LINK_COLORS: Partial<Record<SceneItem["kind"], string>> = { STOCK_LOCATION: "#38bdf8", VEHICLE: "#f59e0b" };

function Arc({ from, to, color }: { from: THREE.Vector3; to: THREE.Vector3; color: string }) {
  const ref = useRef<THREE.Object3D & { material: { dashOffset: number } }>(null);
  const still = !useLightAnimation("links");
  const mid = useMemo(() => from.clone().lerp(to, 0.5).setY(4 + from.distanceTo(to) * 0.25), [from, to]);
  useFrame((state, delta) => {
    if (still || !ref.current) return;
    ref.current.material.dashOffset -= delta * 2;
    state.invalidate();
  });
  return (
    <group>
      <QuadraticBezierLine ref={ref as never} start={from} end={to} mid={mid} color={color} lineWidth={2.5} dashed dashSize={0.8} gapSize={0.4} transparent opacity={0.9} />
      <mesh position={to} raycast={noRaycast}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

/**
 * Arcs lumineux entre un événement et ses ressources : emplacements du matériel encore en entrepôt
 * (bleu) et véhicules affectés (orange). Sélectionner une ressource montre les événements qui l'utilisent.
 */
export function EventLinks({ items, selectedKey }: { items: SceneItem[]; selectedKey: string | null }) {
  const pairs = useMemo(() => {
    if (!selectedKey) return [];
    const byKey = new Map(items.map((i) => [i.key, i]));
    const selected = byKey.get(selectedKey);
    if (!selected) return [];
    const events = selected.kind === "EVENT" ? [selected] : items.filter((i) => i.kind === "EVENT" && i.links?.includes(selectedKey));
    return events.flatMap((e) =>
      (e.links ?? [])
        .filter((k) => selected.kind === "EVENT" || k === selectedKey)
        .flatMap((k) => {
          const target = byKey.get(k);
          if (!target) return [];
          return [{ key: `${e.key}>${k}`, from: new THREE.Vector3(e.position[0], 2.6, e.position[2]), to: new THREE.Vector3(target.position[0], 1.5, target.position[2]), color: LINK_COLORS[target.kind] ?? "#a5b4fc" }];
        }),
    );
  }, [items, selectedKey]);
  return (
    <group>
      {pairs.map((p) => (
        <Arc key={p.key} from={p.from} to={p.to} color={p.color} />
      ))}
    </group>
  );
}

// ── Préparation en direct ────────────────────────────────────────────

const CRATE_COLORS = ["#818cf8", "#f472b6", "#fbbf24"];
const CRATE = new THREE.BoxGeometry(0.7, 0.5, 0.6);

/** Une caisse qui fait l'aller rayonnage → zone de préparation en boucle (décalée de `phase`). */
function TravellingCrate({ from, to, color, phase }: { from: THREE.Vector3; to: THREE.Vector3; color: string; phase: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).setY(2.5 + from.distanceTo(to) * 0.12), to), [from, to]);
  useFrame((state) => {
    if (!ref.current) return;
    const t = (state.clock.elapsedTime / 3.2 + phase) % 1;
    ref.current.position.copy(curve.getPoint(t));
    ref.current.rotation.y = t * Math.PI;
    state.invalidate();
  });
  return (
    <mesh ref={ref} geometry={CRATE} raycast={noRaycast}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
    </mesh>
  );
}

/**
 * Préparation en cours : des caisses quittent les rayonnages qui contiennent le matériel encore à préparer
 * et rejoignent la zone de préparation ; l'étiquette donne l'avancement réel (lignes scannées).
 */
export function PreparationFlows({ items }: { items: SceneItem[] }) {
  const showCrates = useLightAnimation("prep");
  const prep = items.find((i) => i.preparations?.length);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  if (!prep?.preparations) return null;
  const target = new THREE.Vector3(prep.position[0], 0.9, prep.position[2]);
  const label = prep.preparations.map((p) => `${p.reference} · ${Math.round(p.progress * 100)} %`).join("   ");
  return (
    <group>
      {prep.preparations.flatMap((p, pi) =>
        p.sources.flatMap((k, si) => {
          const src = byKey.get(k);
          if (!src || p.progress >= 1 || !showCrates) return [];
          const from = new THREE.Vector3(src.position[0], 1.2, src.position[2]);
          return [0, 0.5].map((offset) => <TravellingCrate key={`${p.reference}-${k}-${offset}`} from={from} to={target} color={CRATE_COLORS[pi % CRATE_COLORS.length]!} phase={offset + si * 0.17} />);
        }),
      )}
      <Label text="Préparation en cours" sub={label} position={[prep.position[0], 4.6, prep.position[2]]} height={0.6} accent="#818cf8" maxDistance={120} />
    </group>
  );
}
