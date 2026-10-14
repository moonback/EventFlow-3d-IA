/**
 * Résolution tolérante d'une cible désignée par Eric vers un objet de la scène : clé exacte
 * (« VEHICLE:id »), identifiant métier renvoyé par un outil « données », ou nom / référence.
 */
import type { SceneItem } from "@/features/scene/types";

export type TargetResolution = { item: SceneItem } | { error: "UNKNOWN_OBJECT" | "AMBIGUOUS"; suggestions: string[] };

/** Minuscules sans accents ni ponctuation superflue. */
export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const describe = (i: SceneItem) => (i.sublabel ? `${i.label} (${i.sublabel})` : i.label);

export function resolveSceneTarget(items: SceneItem[], target: string, kinds?: SceneItem["kind"][]): TargetResolution {
  const pool = kinds ? items.filter((i) => kinds.includes(i.kind)) : items;
  const raw = target.trim();

  const byKey = pool.find((i) => i.key === raw);
  if (byKey) return { item: byKey };
  // « vehicle:abc » ou « VEHICLE : abc »
  const keyMatch = /^([a-z_]+)\s*:\s*(.+)$/i.exec(raw);
  if (keyMatch) {
    const key = `${keyMatch[1]!.toUpperCase()}:${keyMatch[2]!.trim()}`;
    const found = pool.find((i) => i.key === key);
    if (found) return { item: found };
  }
  const byId = pool.filter((i) => i.businessId === raw || (keyMatch && i.businessId === keyMatch[2]!.trim()));
  if (byId.length === 1) return { item: byId[0]! };

  const q = normalizeText(raw);
  if (!q) return { error: "UNKNOWN_OBJECT", suggestions: [] };
  const texts = (i: SceneItem) => [i.label, i.sublabel ?? ""].map(normalizeText);
  const exact = pool.filter((i) => texts(i).includes(q));
  if (exact.length === 1) return { item: exact[0]! };
  const partial = (exact.length ? exact : pool).filter((i) => texts(i).some((t) => t.includes(q)) || q.split(" ").every((w) => texts(i).some((t) => t.includes(w))));
  if (partial.length === 1) return { item: partial[0]! };
  if (partial.length > 1) return { error: "AMBIGUOUS", suggestions: partial.slice(0, 6).map(describe) };
  return { error: "UNKNOWN_OBJECT", suggestions: [] };
}
