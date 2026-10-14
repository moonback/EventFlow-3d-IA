"use client";
import { ZONES } from "@/features/scene/layout";
import type { SceneData } from "@/features/scene/types";
import { STATUS_COLORS } from "../materials/palette";
import { eventCountdown } from "../objects/event-pod";

/**
 * Plan 2D (vue de dessus) des mêmes objets que la 3D : mode plan ET mode de secours sans WebGL.
 * Chaque objet est un bouton accessible au clavier, identifié par son type et son identifiant métier.
 */
export function Plan2D({ data, selectedKey, highlighted, onSelect }: { data: SceneData; selectedKey: string | null; highlighted: Set<string>; onSelect: (key: string) => void }) {
  const minX = -54;
  const maxX = 56;
  const minZ = -36;
  const maxZ = 50;
  return (
    <svg viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`} className="h-full w-full" role="group" aria-label="Plan de l'agence (vue de dessus)">
      <rect x={minX} y={minZ} width={maxX - minX} height={maxZ - minZ} fill="#0b0f19" />
      {ZONES.map((z) => (
        <g key={z.id} pointerEvents="none">
          <rect x={z.center[0] - z.size[0] / 2} y={z.center[1] - z.size[1] / 2} width={z.size[0]} height={z.size[1]} rx={1.5} fill={z.color} fillOpacity={0.08} stroke={z.color} strokeOpacity={0.4} strokeWidth={0.2} />
          <text x={z.center[0] - z.size[0] / 2 + 1} y={z.center[1] - z.size[1] / 2 + 2.4} fill={z.color} fontSize={1.8} fontWeight={600}>
            {z.label}
          </text>
        </g>
      ))}
      {data.items.map((item) => {
        const [x, , z] = item.position;
        const color = STATUS_COLORS[item.status];
        const active = item.key === selectedKey;
        const hl = highlighted.has(item.key);
        const countdown = item.kind === "EVENT" ? eventCountdown(item.startAt, item.endAt) : null;
        const alerts = item.alerts ?? [];
        const w = item.kind === "STOCK_LOCATION" ? (item.variant === "rack" ? 4.2 : 7.5) : item.kind === "VEHICLE" ? 5.5 : item.kind === "DOCK" ? 2.4 : item.kind === "EVENT" ? 2.8 : 3.4;
        const h = item.kind === "STOCK_LOCATION" ? (item.variant === "rack" ? 1.4 : 5) : item.kind === "VEHICLE" ? 2.2 : item.kind === "DOCK" ? 4.2 : item.kind === "EVENT" ? 2.8 : 1;
        return (
          <g
            key={item.key}
            role="button"
            tabIndex={0}
            aria-label={`${item.label}${item.sublabel ? ` — ${item.sublabel}` : ""}${countdown ? ` — ${countdown}` : ""}${alerts.length ? ` — alerte : ${alerts.map((a) => a.message).join(", ")}` : ""}`}
            aria-pressed={active}
            onClick={() => onSelect(item.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(item.key);
              }
            }}
            className="cursor-pointer outline-none focus-visible:[&>rect]:stroke-white"
          >
            {/* Zone de clic couvrant l'objet et son libellé */}
            <rect x={x - Math.max(w, 3) / 2 - 0.3} y={z - h / 2 - 0.3} width={Math.max(w, 3) + 0.6} height={h + 2.6} fill="transparent" />
            <rect x={x - w / 2} y={z - h / 2} width={w} height={h} rx={item.kind === "EVENT" ? 1.4 : 0.3} fill={color} fillOpacity={active || hl ? 0.85 : 0.45} stroke={hl ? "#fbbf24" : active ? "#a5b4fc" : color} strokeWidth={active || hl ? 0.45 : 0.15} />
            <text x={x} y={z + h / 2 + 1.6} textAnchor="middle" fill="#e2e8f0" fontSize={1.1}>
              {countdown ? `${countdown} · ${item.label}` : item.label}
            </text>
            {alerts.length ? (
              <g pointerEvents="none">
                <circle cx={x + w / 2} cy={z - h / 2} r={0.9} fill={alerts.some((a) => a.level === "danger") ? STATUS_COLORS.danger : STATUS_COLORS.warning} />
                <text x={x + w / 2} y={z - h / 2 + 0.45} textAnchor="middle" fill="#fff" fontSize={1.2} fontWeight={700}>
                  !
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
