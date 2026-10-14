"use client";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { AssistantStatus } from "@/assistant/use-assistant";
import { glow, RING, standard } from "../materials/palette";
import type { EricSpot } from "../ui/world-bridge";
import { Label } from "./label";

/** Couleur de l'anneau au sol selon l'état de la conversation */
const MOOD_COLORS: Record<"idle" | "listening" | "thinking" | "speaking", string> = {
  idle: "#64748b",
  listening: "#38bdf8",
  thinking: "#f59e0b",
  speaking: "#22c55e",
};

const SKIN = standard("#e0b48f", { roughness: 0.8 });
const JACKET = standard("#1e293b", { roughness: 0.6 });
const SHIRT = standard("#6366f1", { roughness: 0.5, emissive: "#6366f1", emissiveIntensity: 0.15 });
const TROUSERS = standard("#0f172a", { roughness: 0.8 });
const HEADSET = standard("#111827", { roughness: 0.4, metalness: 0.5 });
const DARK = standard("#111827", { roughness: 0.3 });

const HEAD = new THREE.SphereGeometry(0.21, 24, 18);
const EYE = new THREE.SphereGeometry(0.028, 10, 8);
const MOUTH = new THREE.BoxGeometry(0.1, 0.035, 0.02);
const TORSO = new THREE.CapsuleGeometry(0.24, 0.5, 6, 16);
const LIMB = new THREE.CapsuleGeometry(0.075, 0.55, 4, 10);
const LEG = new THREE.CapsuleGeometry(0.09, 0.7, 4, 10);
const BAND = new THREE.TorusGeometry(0.22, 0.018, 8, 24, Math.PI);
const BOOM = new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6);
const BADGE = new THREE.BoxGeometry(0.1, 0.13, 0.01);

const WALK_SPEED = 6; // m/s : Eric rejoint vite ce dont il parle
const POINT_SECONDS = 4;
const target = new THREE.Vector3();
const toCamera = new THREE.Vector3();

export interface EricProps {
  spot: EricSpot;
  status: AssistantStatus;
  /** Eric consulte des données */
  thinking: boolean;
  /** Amplitude de sa voix (0..1), lue à chaque image */
  level: () => number;
  onClick?: () => void;
}

function angleTowards(fromX: number, fromZ: number, toX: number, toZ: number) {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

/** Rotation la plus courte vers un angle cible (pas de demi-tour par le mauvais côté). */
function turn(current: number, wanted: number, k: number) {
  const delta = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
  return current + delta * k;
}

/**
 * Eric, le régisseur virtuel : personnage stylisé avec casque-micro. Il rejoint l'objet dont il
 * parle, le désigne du bras, bouge la bouche au rythme de sa voix ; l'anneau au sol indique s'il
 * écoute (bleu), consulte (ambre) ou parle (vert). Cliquer sur lui ouvre la conversation.
 */
export function Eric({ spot, status, thinking, level, onClick }: EricProps) {
  const invalidate = useThree((s) => s.invalidate);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const pointUntil = useRef(0);
  const mouthOpen = useRef(0);
  const hovered = useRef(false);
  // Position initiale figée : ensuite Eric marche (useFrame), il n'est jamais téléporté par React
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialPosition = useMemo<[number, number, number]>(() => [spot.position[0], 0, spot.position[1]], []);

  const mood = thinking ? "thinking" : status === "speaking" ? "speaking" : status === "listening" ? "listening" : "idle";
  const active = status !== "idle" && status !== "error";

  // Nouvelle destination : le geste de désignation est rejoué à l'arrivée
  useEffect(() => {
    pointUntil.current = spot.pointing ? Number.POSITIVE_INFINITY : 0;
    invalidate();
  }, [spot, invalidate]);

  useFrame(({ clock, camera }, delta) => {
    const g = root.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    const t = clock.elapsedTime;
    target.set(spot.position[0], 0, spot.position[1]);
    const distance = g.position.distanceTo(target);
    const walking = distance > 0.05;
    if (walking) {
      const step = Math.min(distance, WALK_SPEED * dt);
      const heading = angleTowards(g.position.x, g.position.z, target.x, target.z);
      g.position.lerp(target, step / distance);
      g.rotation.y = turn(g.rotation.y, heading, Math.min(1, dt * 12));
    } else {
      // Arrivé : face à l'objet désigné, sinon face à la caméra
      if (pointUntil.current === Number.POSITIVE_INFINITY) pointUntil.current = t + POINT_SECONDS;
      const look = spot.lookAt;
      if (look) g.rotation.y = turn(g.rotation.y, angleTowards(g.position.x, g.position.z, look[0], look[2]), Math.min(1, dt * 6));
      else {
        toCamera.copy(camera.position);
        g.rotation.y = turn(g.rotation.y, angleTowards(g.position.x, g.position.z, toCamera.x, toCamera.z), Math.min(1, dt * 4));
      }
    }

    // Marche : balancement des jambes et des bras ; sinon respiration
    const swing = walking ? Math.sin(t * 11) * 0.6 : 0;
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.8;
    if (body.current) body.current.position.y = walking ? Math.abs(Math.sin(t * 11)) * 0.05 : Math.sin(t * 1.6) * 0.012;

    // Bras droit : désigne l'objet quelques secondes après l'arrivée
    const pointing = !walking && t < pointUntil.current;
    if (rightArm.current) {
      const wanted = pointing ? -1.45 : walking ? swing * 0.8 : 0;
      rightArm.current.rotation.x += (wanted - rightArm.current.rotation.x) * Math.min(1, dt * 8);
    }

    // Bouche synchronisée sur l'amplitude de la voix, tête légèrement inclinée pendant la consultation
    const open = status === "speaking" ? Math.min(1, level() * 6) : 0;
    mouthOpen.current += (open - mouthOpen.current) * Math.min(1, dt * 18);
    if (mouth.current) mouth.current.scale.y = 0.6 + mouthOpen.current * 4;
    if (head.current) {
      head.current.rotation.z = thinking ? Math.sin(t * 2) * 0.12 : 0;
      head.current.rotation.x = status === "speaking" ? Math.sin(t * 3) * 0.04 : 0;
    }
    if (ring.current) {
      const pulse = active ? 1 + Math.sin(t * (mood === "speaking" ? 6 : 2.5)) * 0.08 : 1;
      ring.current.scale.setScalar(0.75 * pulse * (hovered.current ? 1.15 : 1));
    }

    // Rendu à la demande : Eric ne force l'animation que lorsqu'il bouge ou converse
    if (walking || active || pointing || mouthOpen.current > 0.01) invalidate();
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick?.();
  };

  return (
    <group
      ref={root}
      position={initialPosition}
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation();
        hovered.current = true;
        document.body.style.cursor = "pointer";
        invalidate();
      }}
      onPointerOut={() => {
        hovered.current = false;
        document.body.style.cursor = "";
        invalidate();
      }}
    >
      <mesh ref={ring} geometry={RING} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={0.75}>
        <meshBasicMaterial color={glow(MOOD_COLORS[mood], active ? 2.6 : 1)} transparent opacity={active ? 0.9 : 0.45} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={body}>
        {/* Jambes (pivot à la hanche) */}
        <group ref={leftLeg} position={[-0.11, 0.86, 0]}>
          <mesh geometry={LEG} material={TROUSERS} position={[0, -0.43, 0]} castShadow />
        </group>
        <group ref={rightLeg} position={[0.11, 0.86, 0]}>
          <mesh geometry={LEG} material={TROUSERS} position={[0, -0.43, 0]} castShadow />
        </group>
        {/* Buste : veste ouverte sur chemise aux couleurs d'EventFlow, badge */}
        <mesh geometry={TORSO} material={JACKET} position={[0, 1.25, 0]} castShadow />
        <mesh geometry={BADGE} material={SHIRT} position={[0.12, 1.36, 0.25]} />
        <mesh position={[0, 1.4, 0.2]} material={SHIRT} scale={[0.16, 0.3, 0.06]}>
          <boxGeometry />
        </mesh>
        {/* Bras (pivot à l'épaule) */}
        <group ref={leftArm} position={[-0.33, 1.52, 0]}>
          <mesh geometry={LIMB} material={JACKET} position={[0, -0.3, 0]} castShadow />
          <mesh geometry={EYE} material={SKIN} position={[0, -0.64, 0]} scale={2.4} />
        </group>
        <group ref={rightArm} position={[0.33, 1.52, 0]}>
          <mesh geometry={LIMB} material={JACKET} position={[0, -0.3, 0]} castShadow />
          <mesh geometry={EYE} material={SKIN} position={[0, -0.64, 0]} scale={2.4} />
        </group>
        {/* Tête, yeux, bouche, casque-micro de régisseur */}
        <group ref={head} position={[0, 1.86, 0]}>
          <mesh geometry={HEAD} material={SKIN} castShadow />
          <mesh geometry={EYE} material={DARK} position={[-0.075, 0.03, 0.19]} />
          <mesh geometry={EYE} material={DARK} position={[0.075, 0.03, 0.19]} />
          <mesh ref={mouth} geometry={MOUTH} material={DARK} position={[0, -0.08, 0.2]} />
          <mesh geometry={BAND} material={HEADSET} rotation={[0, Math.PI / 2, 0]} position={[0, 0.02, 0]} />
          <mesh geometry={EYE} material={HEADSET} position={[-0.22, 0, 0]} scale={[1.2, 2.4, 2.4]} />
          <mesh geometry={EYE} material={HEADSET} position={[0.22, 0, 0]} scale={[1.2, 2.4, 2.4]} />
          <mesh geometry={BOOM} material={HEADSET} position={[0.17, -0.09, 0.11]} rotation={[0.9, 0, 0.5]} />
        </group>
      </group>
      <Label text="Eric" sub={mood === "thinking" ? "consulte…" : mood === "speaking" ? "parle" : mood === "listening" ? "à l'écoute" : "régisseur virtuel"} position={[0, 2.45, 0]} height={0.32} accent={MOOD_COLORS[mood]} maxDistance={60} />
    </group>
  );
}
