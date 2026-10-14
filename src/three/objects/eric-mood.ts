/**
 * État visible d'Eric (anneau 3D, pastille du plan 2D) : partagé sans dépendre de Three.js, pour
 * que le plan de secours reste léger.
 */
import type { AssistantStatus } from "@/assistant/use-assistant";

export type EricMood = "idle" | "listening" | "thinking" | "speaking";

/** Gris au repos, bleu à l'écoute, ambre pendant une consultation, vert quand il parle */
export const ERIC_MOOD_COLORS: Record<EricMood, string> = {
  idle: "#64748b",
  listening: "#38bdf8",
  thinking: "#f59e0b",
  speaking: "#22c55e",
};

export const ERIC_MOOD_LABELS: Record<EricMood, string> = {
  idle: "régisseur virtuel",
  listening: "à l'écoute",
  thinking: "consulte…",
  speaking: "parle",
};

export function ericMood(status: AssistantStatus, thinking: boolean): EricMood {
  if (thinking) return "thinking";
  if (status === "speaking") return "speaking";
  if (status === "listening") return "listening";
  return "idle";
}
