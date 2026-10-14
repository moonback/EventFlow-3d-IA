"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { CORSICA_OUTLINE, FRANCE_OUTLINE } from "@/features/scene/geo";
import type { SceneItem } from "@/features/scene/types";
import { BOX, standard } from "../materials/palette";

const FRAME = standard("#0f172a", { metalness: 0.6, roughness: 0.3 });
const LEG = standard("#475569", { metalness: 0.6 });
const W = 1200;
const H = 780;
const LON = [-5.4, 9.8];
const LAT = [41.2, 51.3];
const K = Math.cos((46.5 * Math.PI) / 180); // correction de la longitude à la latitude moyenne

/** Projection équirectangulaire corrigée dans le cadre de la carte (marges incluses). */
function projector() {
  const mapW = (LON[1]! - LON[0]!) * K;
  const mapH = LAT[1]! - LAT[0]!;
  const area = { x: 40, y: 90, w: 700, h: 650 };
  const s = Math.min(area.w / mapW, area.h / mapH);
  return (lon: number, lat: number): [number, number] => [area.x + (lon - LON[0]!) * K * s, area.y + (LAT[1]! - lat) * s];
}

function drawMap(map: NonNullable<SceneItem["map"]>) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = (w: number, px: number) => `${w} ${px}px Inter Variable, Inter, system-ui, sans-serif`;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1222");
  g.addColorStop(1, "#0a0f1c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = font(700, 38);
  ctx.textBaseline = "top";
  ctx.fillText("Missions des véhicules", 36, 28);
  const p = projector();
  for (const outline of [FRANCE_OUTLINE, CORSICA_OUTLINE]) {
    ctx.beginPath();
    outline.forEach(([lon, lat], i) => {
      const [x, y] = p(lon, lat);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  const hq = map.hq ? p(map.hq.lon, map.hq.lat) : null;
  // Trajets depuis le siège
  for (const m of map.missions) {
    if (!hq) break;
    const [x, y] = p(m.lon, m.lat);
    ctx.setLineDash(m.onMission ? [] : [10, 8]);
    ctx.strokeStyle = m.onMission ? "rgba(56,189,248,0.9)" : "rgba(167,139,250,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hq[0], hq[1]);
    ctx.quadraticCurveTo((hq[0] + x) / 2, Math.min(hq[1], y) - 40, x, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (hq && map.hq) {
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 9 : 20;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(hq[0] + Math.cos(a) * r, hq[1] + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Points d'arrivée (regroupés par ville pour éviter les superpositions)
  const byPlace = new Map<string, typeof map.missions>();
  for (const m of map.missions) byPlace.set(`${m.lat},${m.lon}`, [...(byPlace.get(`${m.lat},${m.lon}`) ?? []), m]);
  for (const group of byPlace.values()) {
    const [x, y] = p(group[0]!.lon, group[0]!.lat);
    const on = group.some((m) => m.onMission);
    ctx.fillStyle = on ? "#38bdf8" : "#a78bfa";
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0b1222";
    ctx.lineWidth = 3;
    ctx.stroke();
    if (group.length > 1) {
      ctx.fillStyle = "#0b1222";
      ctx.font = font(700, 16);
      ctx.textAlign = "center";
      ctx.fillText(String(group.length), x, y - 9);
      ctx.textAlign = "left";
    }
  }
  // Liste à droite
  let ly = 100;
  ctx.font = font(600, 22);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(map.hq ? `Départ : ${map.hq.name}` : "Siège non situé (adresse de l'organisation)", 780, ly);
  ly += 46;
  for (const m of map.missions.slice(0, 9)) {
    ctx.fillStyle = m.onMission ? "#38bdf8" : "#a78bfa";
    ctx.beginPath();
    ctx.arc(792, ly + 14, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = font(700, 24);
    ctx.fillText(m.vehicle, 812, ly, 360);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = font(400, 20);
    ctx.fillText(`${m.onMission ? "En mission" : "Affecté"} → ${m.city || "?"}${m.precision === "department" ? " (≈)" : ""} · ${m.event}`, 812, ly + 30, 370);
    ly += 66;
  }
  if (map.missions.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = font(400, 22);
    ctx.fillText("Aucun véhicule affecté sur 7 jours", 780, ly);
  }
  ctx.fillStyle = "#64748b";
  ctx.font = font(400, 18);
  ctx.fillText("Position : ville de l'événement (≈ : département). GPS non connecté.", 36, H - 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Grand écran de la zone logistique : carte de France des missions (siège → lieux des événements). */
export function MissionMap({ item }: { item: SceneItem; active: boolean }) {
  const map = item.map;
  const signature = JSON.stringify(map ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la signature JSON couvre le contenu de la carte
  const texture = useMemo(() => (map ? drawMap(map) : null), [signature]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return (
    <group>
      {[-3.2, 3.2].map((x) => (
        <mesh key={x} geometry={BOX} material={LEG} position={[x, 1.4, 0]} scale={[0.14, 2.8, 0.14]} />
      ))}
      <mesh geometry={BOX} material={FRAME} position={[0, 3.6, 0]} scale={[7.4, 4.9, 0.14]} />
      {texture ? (
        <mesh position={[0, 3.6, 0.08]}>
          <planeGeometry args={[7.2, 4.68]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}
