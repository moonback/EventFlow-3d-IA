"use client";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { SceneItem } from "@/features/scene/types";
import { useAnimation } from "../effects/motion";
import { BOX, CYLINDER, glow as glowColor, standard, STATUS_COLORS } from "../materials/palette";
import { eventCountdown } from "./event-pod";
import { Label } from "./label";
import { Model } from "./models";

const BASE = standard("#1f2937", { metalness: 0.4, roughness: 0.5 });
const DECK = standard("#334155", { roughness: 0.6 });
const TRUSS = standard("#cbd5e1", { metalness: 0.8, roughness: 0.3 });
const CLOTH = standard("#f8fafc", { roughness: 0.8 });
const CHAIR = standard("#475569", { roughness: 0.7 });
const GRASS = standard("#15803d", { roughness: 1 });
const SCREEN = standard("#0f172a", { metalness: 0.4, roughness: 0.3 });
const LIGHT_BEAM = standard("#c084fc", { emissive: "#a855f7", emissiveIntensity: 0.9, transparent: true, opacity: 0.35, glow: true });

/** Scène avec truss, enceintes et faisceaux (concert, festival). */
function Stage() {
  return (
    <group>
      <mesh geometry={BOX} material={DECK} position={[0, 0.25, -0.4]} scale={[3, 0.5, 1.8]} />
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} geometry={BOX} material={TRUSS} position={[x, 1.3, -1.2]} scale={[0.12, 2.1, 0.12]} />
      ))}
      <mesh geometry={BOX} material={TRUSS} position={[0, 2.35, -1.2]} scale={[2.9, 0.12, 0.12]} />
      {/* Lyres suspendues au pont, orientées vers le public */}
      {[-0.9, 0, 0.9].map((x) => (
        <group key={x} position={[x, 2.28, -1.2]} rotation={[Math.PI, Math.PI / 2, 0]} scale={0.9}>
          <Model name="lyre" />
        </group>
      ))}
      {[-1.7, 1.7].map((x) => (
        <mesh key={x} geometry={BOX} material={SCREEN} position={[x, 0.75, -0.2]} scale={[0.4, 1.5, 0.4]} />
      ))}
      {[-0.8, 0, 0.8].map((x) => (
        <mesh key={x} geometry={CYLINDER} material={LIGHT_BEAM} position={[x, 1.4, -0.6]} rotation={[0.35, 0, 0]} scale={[0.25, 1.9, 0.25]} />
      ))}
      {/* public */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} geometry={CYLINDER} material={CHAIR} position={[-1.25 + (i % 6) * 0.5, 0.2, 0.9 + Math.floor(i / 6) * 0.5]} scale={[0.18, 0.4, 0.18]} />
      ))}
    </group>
  );
}

/** Tables rondes nappées et chaises (mariage, gala). */
function Banquet() {
  return (
    <group>
      {[
        [-0.9, -0.7],
        [0.9, -0.7],
        [-0.9, 0.9],
        [0.9, 0.9],
      ].map(([x, z], i) => (
        <group key={i} position={[x!, 0, z!]}>
          <mesh geometry={CYLINDER} material={CLOTH} position={[0, 0.4, 0]} scale={[1, 0.08, 1]} />
          <mesh geometry={CYLINDER} material={CLOTH} position={[0, 0.2, 0]} scale={[0.85, 0.4, 0.85]} />
          {Array.from({ length: 6 }).map((_, k) => {
            const a = (k / 6) * Math.PI * 2;
            return <mesh key={k} geometry={BOX} material={CHAIR} position={[Math.cos(a) * 0.68, 0.22, Math.sin(a) * 0.68]} scale={[0.16, 0.44, 0.16]} />;
          })}
        </group>
      ))}
      <mesh geometry={BOX} material={DECK} position={[0, 0.12, -1.65]} scale={[2.4, 0.24, 0.5]} />
    </group>
  );
}

/** Allées de stands (salon). */
function Stands() {
  const colors = ["#38bdf8", "#f472b6", "#facc15", "#34d399", "#a78bfa", "#fb923c"].map((c) => standard(c, { roughness: 0.6 }));
  return (
    <group>
      {Array.from({ length: 6 }).map((_, i) => {
        const x = -1.1 + (i % 3) * 1.1;
        const z = i < 3 ? -0.8 : 0.9;
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh geometry={BOX} material={CLOTH} position={[0, 0.02, 0]} scale={[0.95, 0.04, 0.95]} />
            <mesh geometry={BOX} material={colors[i]!} position={[0, 0.55, i < 3 ? -0.42 : 0.42]} scale={[0.95, 1.1, 0.06]} />
            <mesh geometry={BOX} material={DECK} position={[0, 0.25, 0]} scale={[0.5, 0.5, 0.3]} />
          </group>
        );
      })}
    </group>
  );
}

/** Pupitre et rangées de chaises face à un écran (conférence, séminaire). */
function Theater() {
  return (
    <group>
      <mesh geometry={BOX} material={SCREEN} position={[0, 1.1, -1.6]} scale={[2.4, 1.3, 0.08]} />
      <mesh geometry={BOX} material={DECK} position={[0.9, 0.45, -1]} scale={[0.4, 0.9, 0.3]} />
      {Array.from({ length: 24 }).map((_, i) => (
        <mesh key={i} geometry={BOX} material={CHAIR} position={[-1.25 + (i % 6) * 0.5, 0.22, -0.2 + Math.floor(i / 6) * 0.55]} scale={[0.3, 0.44, 0.3]} />
      ))}
    </group>
  );
}

/** Terrain et tribunes (événement sportif). */
function Arena() {
  return (
    <group>
      <mesh geometry={BOX} material={GRASS} position={[0, 0.05, 0]} scale={[2.6, 0.1, 1.6]} />
      <mesh geometry={BOX} material={CLOTH} position={[0, 0.11, 0]} scale={[0.05, 0.01, 1.6]} />
      {[-1.25, 1.25].map((z) => (
        <mesh key={z} geometry={BOX} material={DECK} position={[0, 0.35, z]} scale={[3, 0.7, 0.6]} />
      ))}
    </group>
  );
}

/** Podium, produit sous projecteur et écrans (lancement produit, autre). */
function Showcase() {
  return (
    <group>
      <mesh geometry={CYLINDER} material={DECK} position={[0, 0.2, 0]} scale={[2, 0.4, 2]} />
      <mesh geometry={BOX} material={CLOTH} position={[0, 0.75, 0]} scale={[0.6, 0.7, 0.6]} />
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} geometry={BOX} material={SCREEN} position={[x, 1, -0.6]} rotation={[0, x > 0 ? -0.5 : 0.5, 0]} scale={[1, 1.4, 0.08]} />
      ))}
      <mesh geometry={CYLINDER} material={LIGHT_BEAM} position={[0, 1.8, 0]} scale={[0.5, 1.6, 0.5]} />
    </group>
  );
}

const HALO = new THREE.TorusGeometry(0.9, 0.04, 8, 48);

/** Halo en rotation autour d'un événement en cours. */
function LiveHalo({ color }: { color: string }) {
  const motion = useAnimation("pulses");
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!motion || !ref.current) return;
    const t = clock.elapsedTime;
    ref.current.rotation.y = t * 0.9;
    ref.current.position.y = 1.6 + Math.sin(t * 1.3) * 0.6;
  });
  return (
    <group ref={ref} position={[0, 1.6, 0]} scale={1.8}>
      <mesh geometry={HALO} rotation={[Math.PI / 2.3, 0, 0]}>
        <meshBasicMaterial color={glowColor(color, 2.2)} toneMapped={false} />
      </mesh>
      <mesh geometry={HALO} rotation={[Math.PI / 1.8, 0.6, 0]} scale={0.8}>
        <meshBasicMaterial color={glowColor(color, 1.6)} toneMapped={false} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

const MODELS = { stage: Stage, banquet: Banquet, stands: Stands, theater: Theater, arena: Arena, showcase: Showcase };

/**
 * Maquette d'événement selon son type (scène, banquet, salon, conférence, sport, lancement), à l'échelle
 * du nombre d'invités. Un socle coloré et une balise lumineuse indiquent l'état ; une barre au sol
 * matérialise la durée sur la frise.
 */
export function EventMiniature({ item, active }: { item: SceneItem; active: boolean }) {
  const color = STATUS_COLORS[item.status];
  const glow = standard(color, { emissive: color, emissiveIntensity: active ? 1 : 0.6, glow: true });
  const rim = standard(color, { emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.55 });
  const Model = MODELS[item.miniature ?? "showcase"];
  const size = item.size ?? 1;
  const span = item.span ?? 0;
  const countdown = eventCountdown(item.startAt, item.endAt);
  return (
    <group>
      {/* Barre de durée sur la frise (du début à la fin de l'événement) */}
      {span > 0.2 ? <mesh geometry={BOX} material={rim} position={[span / 2, 0.03, 0]} scale={[span, 0.04, 0.5]} /> : null}
      <group scale={size}>
        <mesh geometry={CYLINDER} material={BASE} position={[0, 0.04, 0]} scale={[3.4, 0.08, 3.4]} />
        <mesh geometry={CYLINDER} material={rim} position={[0, 0.09, 0]} scale={[3.5, 0.02, 3.5]} />
        <group position={[0, 0.08, 0]}>
          <Model />
        </group>
        <mesh geometry={CYLINDER} material={glow} position={[1.55, 0.9, 1.2]} scale={[0.14, 1.8, 0.14]} />
        {item.variant === "live" ? <LiveHalo color={color} /> : null}
      </group>
      <Label
        text={countdown ? `${countdown} · ${item.label}` : item.label}
        sub={active ? `${item.sublabel ?? ""}${item.guests ? ` · ${item.guests.toLocaleString("fr-FR")} invités` : ""}` : undefined}
        position={[0, 2.6 * size + 0.8, 0]}
        height={0.55}
        accent={color}
      />
    </group>
  );
}
