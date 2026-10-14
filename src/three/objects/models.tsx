"use client";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Component, Suspense, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

/**
 * Modèles détaillés (glTF compressés Meshopt, générés par scripts/build-models.ts).
 * Le décodeur Meshopt est embarqué : aucun appel réseau tiers. Draco n'est pas utilisé.
 */
export const MODEL_URLS = {
  truck: "/models/truck.glb",
  van: "/models/van.glb",
  forklift: "/models/forklift.glb",
  lyre: "/models/lyre.glb",
  flightcase: "/models/flightcase.glb",
} as const;
export type ModelName = keyof typeof MODEL_URLS;

if (typeof window !== "undefined") for (const url of Object.values(MODEL_URLS)) useGLTF.preload(url, false, true);

const noRaycast = () => null;

/** En cas d'échec de chargement (fichier absent, réseau), on affiche la version procédurale. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function LoadedModel({ name, materials, interactive }: { name: ModelName; materials?: Partial<Record<string, THREE.Material>>; interactive: boolean }) {
  const { scene } = useGLTF(MODEL_URLS[name], false, true);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material;
      const override = materials?.[mat.name];
      if (override) mesh.material = override;
      if (!interactive) mesh.raycast = noRaycast;
    });
    return clone;
  }, [scene, materials, interactive]);
  return <primitive object={object} />;
}

/**
 * Modèle détaillé avec repli : la version procédurale (`fallback`) s'affiche pendant le chargement
 * et si le modèle ne peut pas être chargé. `materials` remplace des matériaux par leur nom (ex. « status »).
 */
export function Model({ name, fallback = null, materials, interactive = true }: { name: ModelName; fallback?: ReactNode; materials?: Partial<Record<string, THREE.Material>>; interactive?: boolean }) {
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedModel name={name} materials={materials} interactive={interactive} />
      </Suspense>
    </ModelBoundary>
  );
}

const world = new THREE.Vector3();

/** Niveau de détail : `near` en deçà de `distance` mètres de la caméra, `far` au-delà. */
export function NearFar({ near, far, distance = 60 }: { near: ReactNode; far: ReactNode; distance?: number }) {
  const nearRef = useRef<THREE.Group>(null);
  const farRef = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (!nearRef.current || !farRef.current) return;
    nearRef.current.getWorldPosition(world);
    const close = camera.position.distanceTo(world) < distance;
    nearRef.current.visible = close;
    farRef.current.visible = !close;
  });
  return (
    <>
      <group ref={nearRef}>{near}</group>
      <group ref={farRef} visible={false}>
        {far}
      </group>
    </>
  );
}
