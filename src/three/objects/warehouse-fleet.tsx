"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAnimation, useLightAnimation } from "../effects/motion";
import { BOX, CYLINDER, glow, standard } from "../materials/palette";
import { Model } from "./models";

const noRaycast = () => null;
const ORANGE = standard("#f59e0b", { roughness: 0.5 });
const DARK = standard("#1f2937", { roughness: 0.7 });
const STEEL = standard("#9ca3af", { metalness: 0.8, roughness: 0.3 });

/** Engin du décor : position de stationnement et trajet en boucle dans les allées (coordonnées x, z). */
interface FleetVehicle {
  id: string;
  model: "forklift" | "pallet";
  parked: { position: [number, number]; rotationY: number };
  route: [number, number][];
  speed: number;
}

/**
 * Allées de l'entrepôt : entre les rangées de rayonnages (z = -9 et z = -3), allée nord (z = -14,5),
 * allée sud devant les zones de préparation / retour, portes de quai (z = -10, z = 0) et quais.
 */
export const FLEET: FleetVehicle[] = [
  {
    id: "forklift-1",
    model: "forklift",
    parked: { position: [-7.5, 8.5], rotationY: Math.PI / 2 },
    // Navette entre les rangées : stockage / déstockage
    route: [[-19, -3], [-6, -3], [6, -3], [19, -3], [19.5, -6], [19, -9], [6, -9], [-6, -9], [-19, -9], [-19.5, -6]],
    speed: 3.2,
  },
  {
    id: "forklift-2",
    model: "forklift",
    parked: { position: [11, 7.5], rotationY: -Math.PI / 3 },
    // Préparation → porte principale → quais → retour par la porte de quai nord et l'allée nord
    route: [[-14, 7.8], [0, 7.4], [16, 6.5], [20.5, 2], [24.5, 0], [25.4, -5], [24.5, -10], [20.5, -10], [17, -14.5], [0, -14.5], [-20.5, -14.5], [-20.8, 0], [-19, 6.8]],
    speed: 3.6,
  },
  {
    id: "pallet-1",
    model: "pallet",
    parked: { position: [-18.5, 15.2], rotationY: 0 },
    // Transpalette : allée sud, devant les zones de préparation, retour, quarantaine et atelier
    route: [[-19, 16], [19, 16], [19.4, 15.3], [-19, 15.2], [-19.4, 15.6]],
    speed: 1.6,
  },
];

/** Nombre d'engins en circulation selon l'activité du jour (mouvements de stock depuis minuit). */
export function activeFleetCount(movementsToday: number) {
  if (movementsToday <= 0) return 0;
  return movementsToday >= 20 ? 3 : movementsToday >= 5 ? 2 : 1;
}

/** Transpalette électrique (procédural) : timon, châssis, fourches, palette chargée. */
function PalletTruck() {
  return (
    <group>
      <mesh geometry={BOX} material={ORANGE} position={[-0.55, 0.55, 0]} scale={[0.5, 0.9, 0.7]} raycast={noRaycast} />
      <mesh geometry={BOX} material={DARK} position={[-0.75, 1.15, 0]} rotation={[0, 0, -0.35]} scale={[0.06, 0.7, 0.06]} raycast={noRaycast} />
      <mesh geometry={BOX} material={DARK} position={[-0.9, 1.45, 0]} scale={[0.06, 0.06, 0.4]} raycast={noRaycast} />
      {[-0.22, 0.22].map((z) => (
        <mesh key={z} geometry={BOX} material={STEEL} position={[0.3, 0.08, z]} scale={[1.2, 0.08, 0.16]} raycast={noRaycast} />
      ))}
      {/* palette et colis */}
      <mesh geometry={BOX} material={standard("#a16207", { roughness: 0.9 })} position={[0.35, 0.2, 0]} scale={[1.1, 0.14, 0.9]} raycast={noRaycast} />
      <mesh geometry={BOX} material={standard("#cbd5e1", { roughness: 0.8 })} position={[0.35, 0.6, 0]} scale={[1, 0.66, 0.8]} raycast={noRaycast} />
      {[[-0.55, 0.3], [-0.55, -0.3]].map(([x, z], i) => (
        <mesh key={i} geometry={CYLINDER} material={DARK} position={[x!, 0.1, z!]} rotation={[Math.PI / 2, 0, 0]} scale={[0.2, 0.08, 0.2]} raycast={noRaycast} />
      ))}
    </group>
  );
}

const tangent = new THREE.Vector3();

/** Un engin : suit sa boucle s'il circule (gyrophare orange clignotant), sinon reste stationné. */
function FleetUnit({ vehicle, moving, phase }: { vehicle: FleetVehicle; moving: boolean; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.Mesh>(null);
  const blink = useLightAnimation("blink");
  const curve = useMemo(() => new THREE.CatmullRomCurve3(vehicle.route.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "centripetal", 0.4), [vehicle.route]);
  const length = useMemo(() => curve.getLength(), [curve]);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    if (!moving) {
      g.position.set(vehicle.parked.position[0], 0, vehicle.parked.position[1]);
      g.rotation.y = vehicle.parked.rotationY;
      return;
    }
    const u = ((clock.elapsedTime * vehicle.speed) / length + phase) % 1;
    g.position.copy(curve.getPointAt(u));
    curve.getTangentAt(u, tangent);
    g.rotation.y = Math.atan2(-tangent.z, tangent.x); // modèles orientés vers +x
    if (beacon.current) beacon.current.visible = !blink || Math.floor(clock.elapsedTime * 3 + phase * 10) % 2 === 0;
  });
  const top = vehicle.model === "forklift" ? 2.42 : 1.12;
  return (
    <group ref={ref} position={[vehicle.parked.position[0], 0, vehicle.parked.position[1]]} rotation={[0, vehicle.parked.rotationY, 0]}>
      {vehicle.model === "forklift" ? <Model name="forklift" interactive={false} /> : <PalletTruck />}
      {moving ? (
        <mesh ref={beacon} position={[vehicle.model === "forklift" ? -0.3 : -0.55, top, 0]} raycast={noRaycast}>
          <sphereGeometry args={[0.1, 12, 8]} />
          <meshBasicMaterial color={glow("#f59e0b", 3)} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}

/**
 * Chariots élévateurs et transpalette de l'entrepôt : ils circulent dans les allées quand il y a eu
 * des mouvements de stock aujourd'hui (plus d'activité = plus d'engins), et restent stationnés sinon,
 * ou si les animations sont coupées (qualité basse, mouvement réduit).
 */
export function WarehouseFleet({ movementsToday }: { movementsToday: number }) {
  const animated = useAnimation("fleet");
  const active = animated ? activeFleetCount(movementsToday) : 0;
  return (
    <group>
      {FLEET.map((v, i) => (
        <FleetUnit key={v.id} vehicle={v} moving={i < active} phase={i * 0.37} />
      ))}
    </group>
  );
}
