import type { PropType } from "@/features/site-plan/catalog";

export type Tool = "select" | "wall" | "room" | "door" | "window" | "prop";
export type ElementKind = "wall" | "opening" | "room" | "prop";
export type Selection = { kind: ElementKind; id: string } | null;
/** Fenêtre visible du plan, en mètres (viewBox SVG : x vers l'est, y = z vers le sud). */
export type View = { x: number; y: number; w: number; h: number };

export const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: "select", label: "Sélection", key: "V", hint: "Cliquer pour sélectionner, glisser pour déplacer" },
  { id: "wall", label: "Mur", key: "M", hint: "Cliquer pour poser chaque angle · double-clic ou Échap pour terminer · Maj : angle libre" },
  { id: "room", label: "Pièce", key: "P", hint: "Cliquer chaque sommet · cliquer le premier point ou double-clic pour fermer" },
  { id: "door", label: "Porte", key: "D", hint: "Cliquer sur un mur pour y percer une porte" },
  { id: "window", label: "Fenêtre", key: "F", hint: "Cliquer sur un mur pour y poser une fenêtre" },
  { id: "prop", label: "Accessoire", key: "A", hint: "Choisir dans le catalogue puis cliquer pour poser" },
];

export interface ToolState {
  tool: Tool;
  propType: PropType;
}
