"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useAmbience } from "../materials/ambience";

const noRaycast = () => null;
const FONT = "Inter Variable, Inter, system-ui, sans-serif";

/** Nom affiché (sans mention entre parenthèses) et monogramme de l'organisation. */
export function brandIdentity(name: string) {
  const display = name.replace(/\s*\(.*?\)\s*/g, " ").trim() || name;
  const initials =
    display
      .split(/\s+/)
      .filter((w) => /^\p{L}/u.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "EF";
  return { display, initials };
}

function monogram(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, initials: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(r * 0.95)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, x, y + r * 0.04);
  ctx.textAlign = "left";
}

type BrandKind = "livery" | "sign" | "floor";

/** Texture d'habillage générée à partir du nom et de la couleur d'accent de l'organisation. */
function makeBrandTexture(name: string, color: string, kind: BrandKind) {
  const { display, initials } = brandIdentity(name);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  if (kind === "floor") {
    canvas.width = canvas.height = 512;
    ctx.strokeStyle = color;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(256, 256, 236, 0, Math.PI * 2);
    ctx.stroke();
    monogram(ctx, 256, 220, 120, color, initials);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 34px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(display, 256, 400, 380);
  } else if (kind === "sign") {
    canvas.width = 1024;
    canvas.height = 160;
    ctx.fillStyle = "#0b1222";
    ctx.fillRect(0, 0, 1024, 160);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 14, 160);
    monogram(ctx, 100, 80, 56, color, initials);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 64px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText(display, 180, 84, 820);
  } else {
    // Livrée de camion : bandeau diagonal à la couleur de l'agence, monogramme et nom sur fond transparent
    canvas.width = 1024;
    canvas.height = 300;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 230);
    ctx.lineTo(1024, 150);
    ctx.lineTo(1024, 210);
    ctx.lineTo(0, 290);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(0, 196);
    ctx.lineTo(1024, 118);
    ctx.lineTo(1024, 136);
    ctx.lineTo(0, 214);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    monogram(ctx, 110, 100, 72, color, initials);
    ctx.fillStyle = "#0f172a";
    ctx.font = `800 70px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText(display, 205, 96, 790);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: canvas.width / canvas.height };
}

function useBrandTexture(kind: BrandKind) {
  const site = useAmbience()?.site;
  const name = site?.name ?? "EventFlow";
  const color = site?.accentColor ?? "#6366f1";
  const result = useMemo(() => makeBrandTexture(name, color, kind), [name, color, kind]);
  useEffect(() => () => result.texture.dispose(), [result]);
  return result;
}

/** Livrée sur les deux flancs de la caisse d'un véhicule (longueur utile `length`, hauteur `height`). */
export function TruckLivery({ x, y, length, height, halfWidth }: { x: number; y: number; length: number; height: number; halfWidth: number }) {
  const { texture } = useBrandTexture("livery");
  return (
    <group>
      {[1, -1].map((side) => (
        <mesh key={side} position={[x, y, side * (halfWidth + 0.012)]} rotation={[0, side === 1 ? 0 : Math.PI, 0]} raycast={noRaycast}>
          <planeGeometry args={[length, height]} />
          <meshStandardMaterial map={texture} transparent roughness={0.5} metalness={0.1} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
    </group>
  );
}

/** Enseigne lumineuse (la nuit) : panneau au nom de l'agence. */
export function BrandSign({ position, rotationY = 0, width }: { position: [number, number, number]; rotationY?: number; width: number }) {
  const { texture, aspect } = useBrandTexture("sign");
  const night = useAmbience()?.night ?? 0;
  return (
    <mesh position={position} rotation={[0, rotationY, 0]} raycast={noRaycast}>
      <planeGeometry args={[width, width / aspect]} />
      <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.15 + night * 0.9} roughness={0.4} />
    </mesh>
  );
}

/** Logo au sol (parvis). */
export function BrandFloor({ position, size }: { position: [number, number, number]; size: number }) {
  const { texture } = useBrandTexture("floor");
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} opacity={0.9} />
    </mesh>
  );
}
