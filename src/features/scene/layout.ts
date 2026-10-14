/**
 * Disposition du monde 3D (partagée serveur/client). Unités : mètres.
 * Les positions par défaut ne servent qu'au placement visuel ; l'identité d'un objet
 * est TOUJOURS portée par (type, identifiant métier), jamais par sa position.
 */
import type { SceneZone } from "@prisma/client";

export interface ZoneDef {
  id: SceneZone;
  label: string;
  description: string;
  center: [number, number];
  size: [number, number];
  color: string;
}

export const ZONES: ZoneDef[] = [
  { id: "OFFICE", label: "Bureau de direction", description: "Pilotage, calendrier, indicateurs", center: [-38, -22], size: [26, 20], color: "#6366f1" },
  { id: "WAREHOUSE", label: "Entrepôt", description: "Rayonnages, préparation, retours, quarantaine", center: [0, 0], size: [44, 34], color: "#0ea5e9" },
  { id: "LOGISTICS", label: "Zone logistique", description: "Quais, véhicules, chargements", center: [40, 0], size: [28, 34], color: "#f59e0b" },
  { id: "EVENTS", label: "Événements", description: "Frise : de J-14 à J+60", center: [0, 36], size: [60, 22], color: "#10b981" },
  { id: "CONTROL", label: "Centre de contrôle", description: "Supervision globale", center: [-38, 8], size: [26, 24], color: "#ec4899" },
];

export function zoneById(id: SceneZone): ZoneDef {
  return ZONES.find((z) => z.id === id)!;
}

/** Placement par défaut sur une grille à l'intérieur d'une zone. */
export function gridPosition(zone: SceneZone, index: number, opts: { cols: number; spacingX: number; spacingZ: number; offsetX?: number; offsetZ?: number }): [number, number, number] {
  const z = zoneById(zone);
  const col = index % opts.cols;
  const row = Math.floor(index / opts.cols);
  const width = (opts.cols - 1) * opts.spacingX;
  const x = z.center[0] - width / 2 + col * opts.spacingX + (opts.offsetX ?? 0);
  const zz = z.center[1] - z.size[1] / 2 + 5 + row * opts.spacingZ + (opts.offsetZ ?? 0);
  return [Math.round(x * 100) / 100, 0, Math.round(zz * 100) / 100];
}

/** Emplacements spéciaux de l'entrepôt : position par défaut le long du mur sud. */
export const SPECIAL_AREA_OFFSETS: Record<string, [number, number]> = {
  PREPARATION: [-14, 12],
  RETURN: [-4, 12],
  QUARANTINE: [6, 12],
  MAINTENANCE: [15, 12],
};

export const OFFICE_SCREENS = [
  { businessId: "finance", type: "KPI_SCREEN", label: "Indicateurs financiers", position: [-44, 0, -28] },
  { businessId: "calendar", type: "CALENDAR_BOARD", label: "Calendrier des événements", position: [-36, 0, -30] },
  { businessId: "alerts", type: "ALERT_BOARD", label: "Alertes stock & logistique", position: [-30, 0, -24] },
  { businessId: "tasks", type: "KPI_SCREEN", label: "Tâches urgentes", position: [-44, 0, -18] },
] as const;

export const CONTROL_SCREENS = [
  { businessId: "planning", label: "Planning" },
  { businessId: "stock", label: "Occupation du stock" },
  { businessId: "vehicles", label: "Véhicules mobilisés" },
  { businessId: "staff", label: "Équipes affectées" },
  { businessId: "late-tasks", label: "Tâches en retard" },
  { businessId: "quotes", label: "Devis à relancer" },
  { businessId: "invoices", label: "Factures impayées" },
  { businessId: "maintenance", label: "Alertes maintenance" },
  { businessId: "finance", label: "Indicateurs financiers" },
] as const;

export const DOCKS = ["dock-1", "dock-2", "dock-3"] as const;

/**
 * Postes de travail de l'open space (bureau de direction) : une colonne le long du mur ouest
 * puis une rangée au sud. Au-delà, les collaborateurs ne sont pas représentés (indiqué sur la plaque).
 */
export const STAFF_DESK_SLOTS: [number, number, number][] = [
  ...[-29, -26, -23, -20, -17].map((z) => [-49.5, 0, z] as [number, number, number]),
  ...[-45, -41.5, -38, -34.5].map((x) => [x, 0, -14] as [number, number, number]),
];

/**
 * Frise temporelle de la zone Événements : de J-14 à J+60, de gauche à droite.
 * Les événements sont posés sur des couloirs parallèles à l'axe pour ne pas se chevaucher.
 */
export const TIMELINE = { pastDays: 14, futureDays: 60, x0: -28, x1: 28, axisZ: 27.5, lanes: [31.5, 36, 40.5, 45] } as const;
const DAY_MS = 86_400_000;

/** Abscisse d'un instant sur la frise (bornée aux extrémités). */
export function timelineX(date: Date | string, now: Date | string): number {
  const days = (new Date(date).getTime() - new Date(now).getTime()) / DAY_MS;
  const t = (Math.min(TIMELINE.futureDays, Math.max(-TIMELINE.pastDays, days)) + TIMELINE.pastDays) / (TIMELINE.pastDays + TIMELINE.futureDays);
  return TIMELINE.x0 + t * (TIMELINE.x1 - TIMELINE.x0);
}

/** Miniature selon le type d'événement (rapprochement par mots-clés du nom du type). */
export type EventMiniature = "stage" | "banquet" | "stands" | "theater" | "arena" | "showcase";
export function miniatureFor(typeName: string | null | undefined): EventMiniature {
  const n = (typeName ?? "").toLowerCase();
  if (/concert|festival|spectacle|soir[ée]e|dj/.test(n)) return "stage";
  if (/mariage|gala|d[îi]ner|banquet|cocktail|anniversaire/.test(n)) return "banquet";
  if (/salon|foire|expo|march[ée]/.test(n)) return "stands";
  if (/conf[ée]rence|s[ée]minaire|congr[èe]s|formation|assembl/.test(n)) return "theater";
  if (/sport|match|course|tournoi|marathon/.test(n)) return "arena";
  return "showcase";
}

/** Échelle de la miniature selon le nombre d'invités (140 invités ≈ 1, 12 000 ≈ 1,6). */
export function miniatureScale(guests: number | null | undefined): number {
  if (!guests || guests <= 0) return 1;
  return Math.min(1.6, Math.max(0.8, 0.35 + 0.3 * Math.log10(guests)));
}

/** Mobilier interactif du bureau. */
export const OFFICE_FURNITURE = {
  meetingTable: [-28.5, 0, -16.5] as [number, number, number],
  /** Corbeille à courrier posée sur le bureau de direction */
  mailbox: [-36.4, 0, -20.2] as [number, number, number],
  safe: [-34, 0, -26.6] as [number, number, number],
};
