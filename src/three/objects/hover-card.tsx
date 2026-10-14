"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import * as THREE from "three";
import type { SceneItem } from "@/features/scene/types";
import { STATUS_COLORS, STATUS_LABELS } from "../materials/palette";
import { footprint } from "./footprint";

export const KIND_LABELS: Record<SceneItem["kind"], string> = {
  STOCK_LOCATION: "Emplacement",
  VEHICLE: "Véhicule",
  DOCK: "Quai",
  EVENT: "Événement",
  KPI_SCREEN: "Indicateurs",
  CALENDAR_BOARD: "Calendrier",
  ALERT_BOARD: "Alertes",
  STAFF_DESK: "Poste de travail",
  MISSION_MAP: "Carte des missions",
  MEETING_TABLE: "Salle de réunion",
  QUOTE_MAILBOX: "Courrier des devis",
  INVOICE_SAFE: "Créances",
};

/** Place la carte (élément HTML hors du canevas) à mi-hauteur de l'objet survolé, à chaque image. */
export function HoverCardProjector({ item, element }: { item: SceneItem; element: RefObject<HTMLDivElement | null> }) {
  const anchor = useMemo(() => new THREE.Vector3(item.position[0], item.position[1] + (footprint(item).top * item.scale) / 2, item.position[2]), [item]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const el = element.current;
    if (!el) return;
    v.copy(anchor).project(camera);
    el.style.visibility = v.z < 1 ? "visible" : "hidden";
    el.style.transform = `translate(${((v.x + 1) / 2) * size.width + 32}px, ${((1 - v.y) / 2) * size.height}px) translateY(-50%)`;
  });
  return null;
}

/** Info-bulle au survol : identité, état et premières métriques, sans ouvrir le panneau. */
export function HoverCard({ item, element }: { item: SceneItem; element: RefObject<HTMLDivElement | null> }) {
  const color = STATUS_COLORS[item.status];
  return (
    <div ref={element} className="pointer-events-none absolute top-0 left-0 z-10 w-56 rounded-lg border border-border bg-background/90 p-2.5 text-xs shadow-xl backdrop-blur" style={{ visibility: "hidden" }} role="tooltip">
      <div className="flex items-center justify-between gap-2 text-[10px] tracking-wide text-muted-foreground uppercase">
        <span>{KIND_LABELS[item.kind]}</span>
        <span className="flex items-center gap-1 normal-case">
          <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
          {STATUS_LABELS[item.status]}
        </span>
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{item.label}</div>
      {item.sublabel ? <div className="truncate text-muted-foreground">{item.sublabel}</div> : null}
      {typeof item.fill === "number" ? (
        <div className="mt-1.5">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.round(item.fill * 100)}%`, background: color }} />
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">Remplissage {Math.round(item.fill * 100)} %</div>
        </div>
      ) : null}
      {item.metrics?.length ? (
        <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5">
          {item.metrics.slice(0, 3).map((m) => (
            <div key={m.label} className="contents">
              <dt className="truncate text-muted-foreground">{m.label}</dt>
              <dd className="text-right font-medium text-foreground tabular-nums">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-1.5 text-[10px] text-muted-foreground">Cliquer pour ouvrir le détail</div>
    </div>
  );
}
