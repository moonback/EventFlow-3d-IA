"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { SceneItem } from "@/features/scene/types";
import { useLightAnimation } from "../effects/motion";
import { BOX, CYLINDER, standard, STATUS_COLORS } from "../materials/palette";
import { Label } from "./label";

const noRaycast = () => null;
const WOOD = standard("#5b3a1e", { roughness: 0.7 });
const LEG = standard("#334155", { metalness: 0.6, roughness: 0.4 });
const CHAIR = standard("#1f2937", { roughness: 0.8 });
const METAL = standard("#374151", { metalness: 0.8, roughness: 0.35 });
const STEEL = standard("#9ca3af", { metalness: 0.9, roughness: 0.25 });
const PAPER = standard("#f8fafc", { roughness: 0.9 });
const TRAY = standard("#1e293b", { roughness: 0.6 });
const FOLDER = standard("#b91c1c", { roughness: 0.7 });
const FOLDER_EDGE = standard("#7f1d1d", { roughness: 0.7 });

/** Zone de clic élargie (transparente) pour les petits objets. */
function HitBox({ size, y }: { size: [number, number, number]; y: number }) {
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** Table ronde de la salle de réunion (8 places) : point d'entrée du mode réunion. */
export function MeetingTable({ item, meeting }: { item: SceneItem; active: boolean; meeting: boolean }) {
  const rim = standard("#38bdf8", { emissive: "#38bdf8", emissiveIntensity: meeting ? 0.9 : 0.25, glow: true });
  return (
    <group>
      <mesh material={WOOD} position={[0, 0.75, 0]}>
        <cylinderGeometry args={[1.35, 1.35, 0.08, 48]} />
      </mesh>
      <mesh material={rim} position={[0, 0.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.35, 0.03, 8, 64]} />
      </mesh>
      <mesh geometry={CYLINDER} material={LEG} position={[0, 0.37, 0]} scale={[0.3, 0.74, 0.3]} />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 1.85, 0, Math.sin(a) * 1.85]} rotation={[0, -a - Math.PI / 2, 0]}>
            <mesh geometry={CYLINDER} material={CHAIR} position={[0, 0.45, 0]} scale={[0.5, 0.1, 0.5]} />
            <mesh geometry={BOX} material={CHAIR} position={[0, 0.8, 0.24]} scale={[0.46, 0.6, 0.06]} />
            <mesh geometry={CYLINDER} material={LEG} position={[0, 0.22, 0]} scale={[0.06, 0.44, 0.06]} />
          </group>
        );
      })}
      {meeting ? null : <Label text={item.label} sub="Cliquer pour lancer une réunion" position={[0, 2.6, 0]} height={0.45} accent="#7dd3fc" />}
    </group>
  );
}

export interface MeetingData {
  event: { reference: string; name: string; statusLabel: string; startAt: string; endAt: string; timezone: string; venue: string; customer: string };
  staffCount: number;
  vehicles: string[];
  openTasks: number;
  alerts: string[];
  briefing: {
    budget: { revenue: string; cost: string; margin: string; marginRate: string | null } | null;
    team: { name: string; role: string }[];
    equipment: { lines: number; units: number; prepared: number; top: { name: string; quantity: number }[] };
    tasks: { title: string; dueAt: string | null; late: boolean; priority: string }[];
  };
}

const euro = (v: string | number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(v));

/** Écran de la salle de réunion : dossier de l'événement (budget, équipe, matériel, tâches, alertes). */
function drawBriefing(m: MeetingData) {
  const W = 1600;
  const H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  const f = (w: number, px: number) => `${w} ${px}px Inter Variable, Inter, system-ui, sans-serif`;
  c.fillStyle = "#0b1222";
  c.fillRect(0, 0, W, H);
  c.fillStyle = "#38bdf8";
  c.fillRect(0, 0, W, 10);
  c.textBaseline = "top";
  c.fillStyle = "#7dd3fc";
  c.font = f(600, 28);
  c.fillText("RÉUNION DE PRÉPARATION", 48, 36);
  c.fillStyle = "#f8fafc";
  c.font = f(800, 56);
  c.fillText(`${m.event.reference} · ${m.event.name}`, 48, 76, W - 96);
  const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: m.event.timezone, dateStyle: "medium", timeStyle: "short" });
  c.fillStyle = "#cbd5e1";
  c.font = f(400, 28);
  c.fillText(`${fmt.format(new Date(m.event.startAt))} → ${fmt.format(new Date(m.event.endAt))} · ${m.event.customer}${m.event.venue ? ` · ${m.event.venue}` : ""} · ${m.event.statusLabel}`, 48, 150, W - 96);

  const box = (x: number, y: number, w: number, h: number, title: string, color: string) => {
    c.fillStyle = "#111b30";
    c.beginPath();
    c.roundRect(x, y, w, h, 18);
    c.fill();
    c.fillStyle = color;
    c.fillRect(x, y + 18, 6, 40);
    c.fillStyle = "#e2e8f0";
    c.font = f(700, 32);
    c.fillText(title, x + 26, y + 20);
  };
  const line = (x: number, y: number, label: string, value: string, valueColor = "#f8fafc") => {
    c.font = f(400, 26);
    c.fillStyle = "#94a3b8";
    c.fillText(label, x, y, 380);
    c.font = f(700, 28);
    c.fillStyle = valueColor;
    c.textAlign = "right";
    c.fillText(value, x + 680, y - 2, 300);
    c.textAlign = "left";
  };
  const b = m.briefing;
  // Budget
  box(48, 210, 740, 300, "Budget", "#34d399");
  if (b.budget) {
    line(74, 280, "Chiffre d'affaires prévu", euro(b.budget.revenue));
    line(74, 330, "Coûts prévus", euro(b.budget.cost));
    const margin = Number(b.budget.margin);
    line(74, 380, "Marge prévue", euro(margin), margin >= 0 ? "#34d399" : "#f87171");
    line(74, 430, "Taux de marge", b.budget.marginRate ? `${Number(b.budget.marginRate).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—");
  } else {
    c.font = f(400, 26);
    c.fillStyle = "#94a3b8";
    c.fillText("Accès aux finances restreint", 74, 290);
  }
  // Équipe
  box(812, 210, 740, 300, `Équipe (${b.team.length})`, "#a78bfa");
  c.font = f(400, 26);
  b.team.slice(0, 5).forEach((t, i) => {
    c.fillStyle = "#f8fafc";
    c.fillText(t.name, 838, 280 + i * 42, 380);
    c.fillStyle = "#94a3b8";
    c.fillText(t.role, 1230, 280 + i * 42, 300);
  });
  if (b.team.length === 0) {
    c.fillStyle = "#fbbf24";
    c.fillText("Aucun collaborateur affecté", 838, 280);
  }
  // Matériel
  box(48, 534, 740, 300, `Matériel · ${b.equipment.units} unités`, "#38bdf8");
  const pct = b.equipment.units ? Math.round((b.equipment.prepared / b.equipment.units) * 100) : 0;
  c.fillStyle = "#1e293b";
  c.fillRect(74, 600, 680, 16);
  c.fillStyle = pct === 100 ? "#34d399" : "#38bdf8";
  c.fillRect(74, 600, (680 * pct) / 100, 16);
  c.font = f(600, 24);
  c.fillStyle = "#cbd5e1";
  c.fillText(`Préparé : ${pct} % · ${m.vehicles.length} véhicule(s)${m.vehicles.length ? ` (${m.vehicles.join(", ")})` : ""}`, 74, 626, 680);
  c.font = f(400, 24);
  b.equipment.top.slice(0, 4).forEach((e, i) => {
    c.fillStyle = "#e2e8f0";
    c.fillText(`${e.name}`, 74, 668 + i * 38, 560);
    c.textAlign = "right";
    c.fillText(`× ${e.quantity}`, 754, 668 + i * 38);
    c.textAlign = "left";
  });
  // Tâches
  box(812, 534, 740, 300, `Tâches ouvertes (${m.openTasks})`, "#fbbf24");
  c.font = f(400, 24);
  b.tasks.slice(0, 5).forEach((t, i) => {
    c.fillStyle = t.late ? "#f87171" : "#e2e8f0";
    const due = t.dueAt ? new Intl.DateTimeFormat("fr-FR", { timeZone: m.event.timezone, day: "numeric", month: "short" }).format(new Date(t.dueAt)) : "—";
    c.fillText(`${t.late ? "! " : "• "}${t.title}`, 838, 600 + i * 42, 560);
    c.textAlign = "right";
    c.fillText(due, 1526, 600 + i * 42);
    c.textAlign = "left";
  });
  if (b.tasks.length === 0) {
    c.fillStyle = "#34d399";
    c.fillText("Aucune tâche ouverte", 838, 600);
  }
  // Alertes
  c.font = f(600, 26);
  c.fillStyle = m.alerts.length ? "#f87171" : "#34d399";
  c.fillText(m.alerts.length ? `Alertes : ${m.alerts.slice(0, 2).join(" · ")}` : "Aucune alerte", 48, 852, W - 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Grand écran sur le mur de la salle de réunion, affiché pendant une réunion. */
export function MeetingScreen({ data, position }: { data: MeetingData; position: [number, number, number] }) {
  const signature = JSON.stringify(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la signature JSON couvre le contenu du dossier
  const texture = useMemo(() => drawBriefing(data), [signature]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={position}>
      <mesh geometry={BOX} material={METAL} position={[0, 0, -0.04]} scale={[4.1, 2.35, 0.06]} raycast={noRaycast} />
      <mesh raycast={noRaycast}>
        <planeGeometry args={[4, 2.25]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Corbeille à courrier sur le bureau de direction : une enveloppe par devis envoyé, drapeau levé s'il faut relancer. */
export function QuoteMailbox({ item, active }: { item: SceneItem; active: boolean }) {
  const mb = item.mailbox;
  const due = mb?.followUps ?? 0;
  const envelopes = Math.min(10, mb?.pending ?? 0);
  const still = !useLightAnimation("blink");
  const pulse = useMemo(() => new THREE.MeshStandardMaterial({ color: "#fbbf24", emissive: "#f59e0b", emissiveIntensity: 0.6 }), []);
  useEffect(() => () => pulse.dispose(), [pulse]);
  useFrame((state) => {
    if (!due || still) return;
    pulse.emissiveIntensity = 0.4 + (Math.sin(state.clock.elapsedTime * 3) + 1) * 0.6; // clignotement doux
    state.invalidate();
  });
  const flag = standard(due ? "#ef4444" : "#64748b", { emissive: due ? "#ef4444" : "#000000", emissiveIntensity: due ? 0.5 : 0, glow: Boolean(due) });
  return (
    <group position={[0, 0.81, 0]}>
      <mesh geometry={BOX} material={TRAY} position={[0, 0.03, 0]} scale={[0.52, 0.06, 0.38]} />
      {Array.from({ length: envelopes }).map((_, i) => (
        <mesh key={i} geometry={BOX} material={i === envelopes - 1 && due ? pulse : PAPER} position={[((i % 3) - 1) * 0.01, 0.07 + i * 0.016, 0]} rotation={[0, (i % 2 ? 1 : -1) * 0.06, 0]} scale={[0.44, 0.012, 0.29]} />
      ))}
      {/* Drapeau de boîte aux lettres : levé quand une relance est due */}
      <mesh geometry={BOX} material={STEEL} position={[0.3, 0.2, 0]} scale={[0.02, 0.4, 0.02]} />
      <mesh geometry={BOX} material={flag} position={[0.3, due ? 0.37 : 0.12, 0.07]} scale={[0.02, 0.1, 0.14]} />
      <HitBox size={[0.8, 0.6, 0.6]} y={0.2} />
      <Label text={due ? `${due} devis à relancer` : "Courrier des devis"} sub={active ? `${mb?.pending ?? 0} envoyés en attente` : undefined} position={[0, 0.9, 0]} height={0.35} accent={due ? "#f59e0b" : "#64748b"} />
    </group>
  );
}

/** Coffre-fort et pile de dossiers rouges : la hauteur de la pile suit le montant des factures en retard. */
export function InvoiceSafe({ item }: { item: SceneItem; active: boolean }) {
  const safe = item.safe;
  const amount = safe?.overdueAmount ?? 0;
  const count = Math.min(12, safe?.overdueCount ?? 0);
  const height = amount > 0 ? Math.min(1.6, Math.max(0.25, 0.25 + 0.35 * Math.log10(1 + amount / 500))) : 0;
  const t = count ? height / count : 0;
  const color = STATUS_COLORS[item.status];
  return (
    <group>
      {/* Coffre */}
      <mesh geometry={BOX} material={METAL} position={[-0.55, 0.55, 0]} scale={[0.9, 1.1, 0.8]} />
      <mesh geometry={BOX} material={standard("#1f2937", { metalness: 0.7, roughness: 0.4 })} position={[-0.55, 0.55, 0.41]} scale={[0.76, 0.96, 0.02]} />
      <mesh material={STEEL} position={[-0.55, 0.62, 0.43]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 24]} />
      </mesh>
      <mesh geometry={BOX} material={STEEL} position={[-0.3, 0.35, 0.43]} scale={[0.04, 0.18, 0.04]} />
      {/* Pile de dossiers en retard */}
      {Array.from({ length: count }).map((_, i) => (
        <group key={i} position={[0.45, t * i + t / 2, 0]} rotation={[0, ((i * 37) % 11) / 60 - 0.08, 0]}>
          <mesh geometry={BOX} material={FOLDER} scale={[0.62, t * 0.86, 0.46]} />
          <mesh geometry={BOX} material={FOLDER_EDGE} position={[0, 0, 0.235]} scale={[0.58, t * 0.5, 0.01]} />
        </group>
      ))}
      <HitBox size={[2, 1.6, 1]} y={0.8} />
      <Label text={count ? `${safe!.overdueCount} facture(s) en retard` : "Créances à jour"} sub={count ? euro(amount) : undefined} position={[0, Math.max(1.5, height + 0.6), 0]} height={0.4} accent={color} />
    </group>
  );
}
