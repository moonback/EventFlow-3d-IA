"use client";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ZONES } from "@/features/scene/layout";
import { useAnimationShown, useMotion } from "../effects/motion";
import { glow } from "../materials/palette";

interface Route {
  id: string;
  color: string;
  points: [number, number][];
  /** Nombre de « colis » circulant sur le trajet */
  pulses: number;
  speed: number;
}

/**
 * Flux matériels du métier : préparation → quais → route → événements, puis retours.
 * Tracés au sol le long des allées (purement visuel, aucune donnée métier).
 */
const ROUTES: Route[] = [
  { id: "prep-dock", color: "#f59e0b", points: [[-14, 10], [-12, 3], [10, 3], [21, 2], [27, 0]], pulses: 4, speed: 0.06 },
  { id: "dock-events", color: "#38bdf8", points: [[31, 0], [44, 0], [48, 6], [48, 18], [42, 22.5], [22, 22.5], [-20, 22.5], [-24, 27]], pulses: 6, speed: 0.035 },
  { id: "returns", color: "#a78bfa", points: [[-28, 30], [-27, 20], [-12, 17.5], [-4, 15]], pulses: 3, speed: 0.07 },
];

const PULSE = new THREE.SphereGeometry(0.28, 12, 12);
const tmp = new THREE.Object3D();

function GroundRoute({ route }: { route: Route }) {
  const motion = useMotion();
  const curve = useMemo(() => new THREE.CatmullRomCurve3(route.points.map(([x, z]) => new THREE.Vector3(x, 0.06, z)), false, "centripetal", 0.3), [route.points]);
  const points = useMemo(() => curve.getSpacedPoints(120), [curve]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type Line2 non exporté par drei
  const line = useRef<any>(null);
  const pulses = useRef<THREE.InstancedMesh>(null);

  const place = (t: number) => {
    const mesh = pulses.current;
    if (!mesh) return;
    for (let i = 0; i < route.pulses; i++) {
      const u = (t * route.speed + i / route.pulses) % 1;
      tmp.position.copy(curve.getPointAt(u));
      tmp.position.y = 0.35;
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => place(0));
  useFrame(({ clock }, delta) => {
    if (!motion) return;
    if (line.current?.material) line.current.material.dashOffset -= delta * 1.6;
    place(clock.elapsedTime);
  });

  return (
    <group>
      <Line points={points} color={route.color} lineWidth={5} transparent opacity={0.12} depthWrite={false} />
      <Line ref={line} points={points} color={glow(route.color, 1.6)} lineWidth={2} dashed dashSize={0.9} gapSize={1.1} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      <instancedMesh ref={pulses} args={[PULSE, undefined, route.pulses]} frustumCulled={false}>
        <meshBasicMaterial color={glow(route.color, 3)} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Arcs de supervision : le centre de contrôle « voit » chaque zone (paquets de données lumineux). */
function DataArcs() {
  const motion = useMotion();
  const hub = ZONES.find((z) => z.id === "CONTROL")!;
  const arcs = useMemo(
    () =>
      ZONES.filter((z) => z.id !== "CONTROL").map((z) => {
        const a = new THREE.Vector3(hub.center[0], 4.2, hub.center[1]);
        const b = new THREE.Vector3(z.center[0], 0.5, z.center[1]);
        const mid = a.clone().lerp(b, 0.5);
        mid.y = 10 + a.distanceTo(b) * 0.18;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        return { id: z.id, color: z.color, curve, points: curve.getPoints(60) };
      }),
    [hub],
  );
  const packets = useRef<THREE.InstancedMesh>(null);
  const place = (t: number) => {
    const mesh = packets.current;
    if (!mesh) return;
    arcs.forEach((arc, i) => {
      for (let k = 0; k < 2; k++) {
        tmp.position.copy(arc.curve.getPointAt((t * 0.12 + i * 0.21 + k * 0.5) % 1));
        tmp.updateMatrix();
        mesh.setMatrixAt(i * 2 + k, tmp.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => place(0));
  useFrame(({ clock }) => {
    if (motion) place(clock.elapsedTime);
  });
  return (
    <group>
      {arcs.map((arc) => (
        <Line key={arc.id} points={arc.points} color={arc.color} lineWidth={1.2} transparent opacity={0.28} depthWrite={false} />
      ))}
      <instancedMesh ref={packets} args={[PULSE, undefined, arcs.length * 2]} frustumCulled={false}>
        <meshBasicMaterial color={glow("#67e8f9", 3)} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export function FlowPaths() {
  const flows = useAnimationShown("flows");
  const arcs = useAnimationShown("arcs");
  return (
    <group>
      {flows ? ROUTES.map((r) => <GroundRoute key={r.id} route={r} />) : null}
      {arcs ? <DataArcs /> : null}
    </group>
  );
}
