/**
 * Catalogue des accessoires posables sur le plan du site (partagé serveur/client).
 * Le rendu 3D de chaque type est procédural (src/three/site/props.tsx) : aucun asset tiers.
 * Dimensions en mètres : [largeur (x), hauteur (y), profondeur (z)].
 */
export const PROP_CATEGORIES = { office: "Bureau", comfort: "Accueil & détente", storage: "Rangement", warehouse: "Entrepôt", safety: "Sécurité", structure: "Structure" } as const;
export type PropCategory = keyof typeof PROP_CATEGORIES;

export interface PropDef {
  label: string;
  category: PropCategory;
  size: [number, number, number];
  /** Bornes de chaque dimension (min, max) */
  min: [number, number, number];
  max: [number, number, number];
  color: string;
  /** La couleur principale peut être changée */
  colorable: boolean;
  /** Bloque le passage lors de la visite à pied */
  solid: boolean;
}

const def = (label: string, category: PropCategory, size: [number, number, number], color: string, opts: { colorable?: boolean; solid?: boolean; min?: [number, number, number]; max?: [number, number, number] } = {}): PropDef => ({
  label,
  category,
  size,
  min: opts.min ?? (size.map((s) => Math.round(s * 40) / 100) as [number, number, number]),
  max: opts.max ?? (size.map((s) => Math.round(s * 400) / 100) as [number, number, number]),
  color,
  colorable: opts.colorable ?? true,
  solid: opts.solid ?? true,
});

export const PROP_CATALOG = {
  desk: def("Bureau", "office", [1.6, 0.75, 0.8], "#e2e8f0"),
  "office-chair": def("Chaise de bureau", "office", [0.6, 1.0, 0.6], "#1f2937", { solid: false }),
  "meeting-table": def("Table de réunion", "office", [3, 0.75, 1.2], "#5b3a1e"),
  whiteboard: def("Tableau blanc", "office", [1.8, 1.9, 0.5], "#f8fafc", { colorable: false }),
  "tv-screen": def("Écran mural", "office", [1.6, 1.8, 0.3], "#0f172a", { colorable: false }),
  printer: def("Imprimante", "office", [0.7, 1.0, 0.6], "#cbd5e1"),
  sofa: def("Canapé", "comfort", [2.2, 0.85, 0.9], "#4338ca"),
  "coffee-table": def("Table basse", "comfort", [1.2, 0.4, 0.7], "#5b3a1e"),
  rug: def("Tapis", "comfort", [3, 0.02, 2], "#1e293b", { solid: false, min: [0.5, 0.01, 0.5], max: [10, 0.05, 10] }),
  plant: def("Plante", "comfort", [0.6, 1.4, 0.6], "#15803d"),
  "water-cooler": def("Fontaine à eau", "comfort", [0.4, 1.3, 0.4], "#e2e8f0", { colorable: false }),
  kitchen: def("Comptoir de cuisine", "comfort", [2.4, 0.9, 0.65], "#f1f5f9"),
  "floor-lamp": def("Lampadaire", "comfort", [0.4, 1.8, 0.4], "#334155", { solid: false }),
  bookshelf: def("Bibliothèque", "storage", [1.2, 2, 0.4], "#5b3a1e"),
  cabinet: def("Armoire", "storage", [1, 2, 0.5], "#64748b"),
  lockers: def("Casiers", "storage", [1.8, 1.9, 0.5], "#475569"),
  shelving: def("Étagère légère", "storage", [2, 2, 0.6], "#94a3b8"),
  pallet: def("Palette", "warehouse", [1.2, 0.15, 0.8], "#b45309", { solid: false, min: [0.8, 0.1, 0.6], max: [1.2, 0.2, 1.2] }),
  crates: def("Caisses empilées", "warehouse", [1.2, 1.4, 0.8], "#a16207"),
  workbench: def("Établi", "warehouse", [2, 0.9, 0.8], "#475569"),
  bin: def("Poubelle", "warehouse", [0.5, 0.9, 0.5], "#16a34a"),
  extinguisher: def("Extincteur", "safety", [0.3, 0.75, 0.3], "#dc2626", { colorable: false, solid: false }),
  barrier: def("Barrière de sécurité", "safety", [2, 1, 0.2], "#facc15"),
  pillar: def("Poteau", "structure", [0.4, 3.5, 0.4], "#94a3b8", { min: [0.15, 1, 0.15], max: [2, 15, 2] }),
} satisfies Record<string, PropDef>;

export type PropType = keyof typeof PROP_CATALOG;
export const PROP_TYPES = Object.keys(PROP_CATALOG) as [PropType, ...PropType[]];

export function propDef(type: PropType): PropDef {
  return PROP_CATALOG[type];
}
