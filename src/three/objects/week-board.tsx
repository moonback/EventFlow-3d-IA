"use client";
import type { ThreeEvent } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { SceneItem } from "@/features/scene/types";
import { BOX, standard } from "../materials/palette";
import { useSceneMode } from "./scene-mode";

const FRAME = standard("#cbd5e1", { metalness: 0.5, roughness: 0.35 });
const LEG = standard("#64748b", { metalness: 0.6 });

/** Couleur de post-it par statut d'événement. */
export const POSTIT_COLORS: Record<string, string> = {
  DRAFT: "#cbd5e1",
  QUOTED: "#7dd3fc",
  CONFIRMED: "#a5b4fc",
  IN_PREPARATION: "#fcd34d",
  READY: "#86efac",
  IN_PROGRESS: "#67e8f9",
  COMPLETED: "#94a3b8",
};

const W = 1280;
const H = 560;
const COLS = 7;
const MAX_PER_DAY = 4;

type Hit = { id: string; u0: number; u1: number; v0: number; v1: number };

/** Dessine le tableau blanc et renvoie les zones cliquables des post-its (en coordonnées UV). */
function drawBoard(week: NonNullable<SceneItem["week"]>) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 34px Inter Variable, Inter, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("Planning de la semaine", 28, 20);
  const colW = (W - 40) / COLS;
  const hits: Hit[] = [];
  week.forEach((day, c) => {
    const x = 20 + c * colW;
    if (c > 0) {
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 70);
      ctx.lineTo(x, H - 16);
      ctx.stroke();
    }
    ctx.fillStyle = c === 0 ? "#2563eb" : "#334155";
    ctx.font = `${c === 0 ? 700 : 600} 24px Inter Variable, Inter, system-ui, sans-serif`;
    ctx.fillText(c === 0 ? `Aujourd'hui` : day.label, x + 10, 78, colW - 20);
    day.events.slice(0, MAX_PER_DAY).forEach((e, r) => {
      const px = x + 8;
      const py = 118 + r * 102;
      const pw = colW - 16;
      const ph = 92;
      ctx.save();
      ctx.shadowColor = "rgba(15,23,42,0.25)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = POSTIT_COLORS[e.status] ?? "#fde68a";
      ctx.fillRect(px, py, pw, ph);
      ctx.restore();
      ctx.fillStyle = "#0f172a";
      ctx.font = "700 19px Inter Variable, Inter, system-ui, sans-serif";
      ctx.fillText(e.reference, px + 8, py + 8, pw - 16);
      ctx.font = "400 18px Inter Variable, Inter, system-ui, sans-serif";
      // Nom sur deux lignes maximum
      const words = e.name.split(" ");
      let line = "";
      let ly = py + 36;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > pw - 16 && line) {
          ctx.fillText(line, px + 8, ly, pw - 16);
          line = w;
          ly += 24;
          if (ly > py + 60) break;
        } else line = test;
      }
      if (ly <= py + 60) ctx.fillText(line, px + 8, ly, pw - 16);
      hits.push({ id: e.id, u0: px / W, u1: (px + pw) / W, v0: 1 - (py + ph) / H, v1: 1 - py / H });
    });
    if (day.events.length > MAX_PER_DAY) {
      ctx.fillStyle = "#475569";
      ctx.font = "600 20px Inter Variable, Inter, system-ui, sans-serif";
      ctx.fillText(`+ ${day.events.length - MAX_PER_DAY} autre(s)`, x + 10, H - 44);
    }
    if (day.events.length === 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "italic 400 18px Inter Variable, Inter, system-ui, sans-serif";
      ctx.fillText("—", x + 10, 124);
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, hits };
}

/**
 * Tableau blanc du bureau : les 7 prochains jours en colonnes, un post-it par événement (couleur = statut).
 * Cliquer sur un post-it ouvre l'événement ; cliquer ailleurs sélectionne le tableau.
 */
export function WeekBoard({ item }: { item: SceneItem; active: boolean }) {
  const router = useRouter();
  const week = item.week ?? [];
  const signature = JSON.stringify(week);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la signature JSON couvre le contenu du planning
  const { texture, hits } = useMemo(() => drawBoard(week), [signature]);
  useEffect(() => () => texture.dispose(), [texture]);

  const { navigate } = useSceneMode();
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const uv = e.uv;
    if (!navigate) return;
    if (!uv) return;
    const hit = hits.find((h) => uv.x >= h.u0 && uv.x <= h.u1 && uv.y >= h.v0 && uv.y <= h.v1);
    if (hit) {
      e.stopPropagation();
      document.body.style.cursor = "";
      router.push(`/events/${hit.id}`);
    }
  };

  return (
    <group>
      {[-4.2, 4.2].map((x) => (
        <mesh key={x} geometry={BOX} material={LEG} position={[x, 1, 0]} scale={[0.12, 2, 0.12]} />
      ))}
      <mesh geometry={BOX} material={FRAME} position={[0, 3.1, 0]} scale={[9.4, 4.3, 0.12]} />
      <mesh position={[0, 3.1, 0.07]} onClick={onClick}>
        <planeGeometry args={[9.1, 4]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}
