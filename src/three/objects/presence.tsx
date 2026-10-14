"use client";
import { Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { apiFetch } from "@/lib/api-client";
import { Label } from "./label";

export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  page: string;
  camera: { position: [number, number, number]; target: [number, number, number]; walking: boolean };
  selectedKey: string | null;
  updatedAt: string;
}

const noRaycast = () => null;
const INTERVAL_MS = 2000;

/**
 * Synchronise toutes les 2 s mon point de vue (caméra + cible) avec le serveur et récupère celui
 * des collègues connectés. Ne déclenche aucun rendu par image ; s'arrête quand l'onglet est masqué.
 */
export function PresenceSync({ page, selectedKey, walking, onOthers }: { page: string; selectedKey: string | null; walking: boolean; onOthers: (others: PresenceUser[]) => void }) {
  const get = useThree((s) => s.get);
  const latest = useRef({ selectedKey, walking, onOthers });
  latest.current = { selectedKey, walking, onOthers };

  useEffect(() => {
    let stopped = false;
    const target = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const { camera, controls } = get();
      const c = controls as unknown as { getTarget?: (out: THREE.Vector3) => THREE.Vector3 } | null;
      if (!latest.current.walking && c?.getTarget) c.getTarget(target);
      else target.copy(camera.position).add(camera.getWorldDirection(dir).multiplyScalar(6));
      const round = (v: THREE.Vector3) => [v.x, v.y, v.z].map((n) => Math.round(n * 100) / 100) as [number, number, number];
      try {
        const others = await apiFetch<PresenceUser[]>("/api/scene/presence", {
          method: "POST",
          body: { page, camera: { position: round(camera.position), target: round(target), walking: latest.current.walking }, selectedKey: latest.current.selectedKey },
        });
        if (!stopped) latest.current.onOthers(others);
      } catch {
        /* réseau indisponible : nouvel essai au prochain cycle */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), INTERVAL_MS);
    const leave = () => {
      // Départ : la présence disparaît immédiatement chez les autres
      void fetch("/api/scene/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page, camera: null, leave: true }), keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      stopped = true;
      clearInterval(t);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [get, page]);
  return null;
}

/**
 * Avatars des collègues : une « caméra » colorée à leur position de vue, un trait vers ce qu'ils regardent
 * et un anneau au sol à cet endroit, avec leur nom.
 */
export function PresenceAvatars({ others }: { others: PresenceUser[] }) {
  return (
    <group>
      {others.map((o) => (
        <Avatar key={o.userId} user={o} />
      ))}
    </group>
  );
}

function Avatar({ user }: { user: PresenceUser }) {
  const { invalidate } = useThree();
  const pos = useMemo(() => new THREE.Vector3(...user.camera.position), [user.camera.position]);
  const tgt = useMemo(() => new THREE.Vector3(...user.camera.target), [user.camera.target]);
  // Avatar posé un peu sous l'œil de la caméra, orienté vers la cible
  const head = useMemo(() => (user.camera.walking ? pos.clone().setY(1.7) : pos.clone()), [pos, user.camera.walking]);
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tgt.clone().sub(head).normalize()), [tgt, head]);
  useEffect(() => invalidate(), [head, tgt, invalidate]);
  const color = user.color;
  return (
    <group>
      <mesh position={head} raycast={noRaycast}>
        <sphereGeometry args={[user.camera.walking ? 0.35 : 0.9, 20, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={head} quaternion={quaternion} raycast={noRaycast}>
        <coneGeometry args={[user.camera.walking ? 0.25 : 0.6, user.camera.walking ? 0.8 : 2, 16, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      <Line points={[head, tgt]} color={color} lineWidth={1.5} dashed dashSize={0.6} gapSize={0.4} transparent opacity={0.7} />
      <mesh position={[tgt.x, 0.06, tgt.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <ringGeometry args={[1.2, 1.5, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <Label text={user.name} sub={user.camera.walking ? "visite à pied" : "regarde ici"} position={[head.x, head.y + (user.camera.walking ? 0.8 : 2), head.z]} height={0.6} accent={color} maxDistance={400} minDistance={1} />
    </group>
  );
}
