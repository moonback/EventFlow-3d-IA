/**
 * Ordre de chargement d'un véhicule (règle « dernier chargé, premier déchargé ») :
 * le matériel installé en premier sur le site (structures, énergie…) doit sortir en premier,
 * il est donc chargé en dernier, près des portes. À priorité égale, le plus lourd puis le plus
 * volumineux est chargé d'abord (au fond, en bas).
 */

export interface LoadingLine {
  sku: string;
  name: string;
  category: string | null;
  color?: string | null;
  quantity: number;
  /** Volume unitaire (m³), inconnu si ni volume ni dimensions */
  unitVolume: number | null;
  /** Poids unitaire (kg) */
  unitWeight: number | null;
}

export interface LoadingStep extends LoadingLine {
  step: number;
  /** Ordre d'installation sur le site (1 = premier installé) */
  setupRank: number;
  volume: number | null;
  weight: number | null;
  /** Emplacement dans la caisse */
  zone: "Fond de caisse" | "Milieu" | "Près des portes";
}

/** Ordre d'installation sur le site selon la catégorie (1 = installé en premier). */
export function setupRank(category: string | null | undefined): number {
  const c = (category ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/structure|scene|tente|barriere|plancher|praticable/.test(c)) return 1;
  if (/electri|energie|distribution|cabl|groupe|chauff|clim/.test(c)) return 2;
  if (/sono|son|eclairage|lumiere|video|ecran/.test(c)) return 3;
  if (/mobilier|table|chaise/.test(c)) return 4;
  if (/deco|signal|fleur/.test(c)) return 5;
  if (/accessoire|consommable/.test(c)) return 6;
  return 4;
}

/** Calcule l'ordre de chargement (étape 1 = chargée en premier, au fond de la caisse). */
export function orderLoading(lines: LoadingLine[]): LoadingStep[] {
  const sorted = lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({ ...l, setupRank: setupRank(l.category), volume: l.unitVolume === null ? null : l.unitVolume * l.quantity, weight: l.unitWeight === null ? null : l.unitWeight * l.quantity }))
    .sort((a, b) => b.setupRank - a.setupRank || (b.weight ?? 0) - (a.weight ?? 0) || (b.volume ?? 0) - (a.volume ?? 0) || a.name.localeCompare(b.name, "fr"));
  const n = sorted.length;
  return sorted.map((l, i) => ({ ...l, step: i + 1, zone: i < n / 3 ? "Fond de caisse" : i < (2 * n) / 3 ? "Milieu" : "Près des portes" }));
}

/** Volume unitaire d'un produit : volume renseigné, sinon calculé à partir des dimensions (cm). */
export function productUnitVolume(p: { volumeM3: unknown; lengthCm: number | null; widthCm: number | null; heightCm: number | null }): number | null {
  if (p.volumeM3 !== null && p.volumeM3 !== undefined) return Number(p.volumeM3);
  if (p.lengthCm && p.widthCm && p.heightCm) return (p.lengthCm * p.widthCm * p.heightCm) / 1_000_000;
  return null;
}
