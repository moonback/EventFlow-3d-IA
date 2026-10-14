import type { SceneItem } from "@/features/scene/types";

/** Emprise au sol (rayon de l'anneau de sélection) et hauteur des balises, par type d'objet. */
export function footprint(item: SceneItem): { radius: number; top: number } {
  switch (item.kind) {
    case "STOCK_LOCATION":
      return item.variant === "rack" ? { radius: 2.6, top: 5.4 } : { radius: 4.4, top: 4.2 };
    case "VEHICLE": {
      const truck = item.variant === "truck";
      return { radius: (truck ? 6.4 : 4.8) / 1.6, top: (truck ? 2.6 : 2) + 3 };
    }
    case "DOCK":
      return { radius: 2.6, top: 6 };
    case "EVENT":
      return { radius: 1.9 * (item.size ?? 1), top: 2.6 * (item.size ?? 1) + 2 };
    case "STAFF_DESK":
      return { radius: 1.5, top: 3 };
    case "MISSION_MAP":
      return { radius: 3.9, top: 6.8 };
    case "MEETING_TABLE":
      return { radius: 2.4, top: 3.2 };
    case "QUOTE_MAILBOX":
      return { radius: 0.6, top: 2 };
    case "INVOICE_SAFE":
      return { radius: 1.3, top: 2.4 };
    case "CALENDAR_BOARD":
      return item.week ? { radius: 4.8, top: 6 } : { radius: 2, top: 4.8 };
    default:
      return { radius: 2, top: 4.8 };
  }
}
