/**
 * Réduction des réponses de services pour Gemini : une réponse d'outil est lue par un modèle qui
 * parle à l'oral, elle doit être courte, sans bruit d'interface et avec des heures locales.
 */
import { TZDate } from "@date-fns/tz";

/** Champs propres à l'interface, inutiles à l'oral */
const DROPPED_KEYS = new Set(["color", "href", "link", "hasPhoto", "photoDocumentId", "passwordHash", "tokenHash", "changes"]);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;
const MAX_STRING = 400;
const MAX_DEPTH = 6;
/** Taille maximale d'une réponse d'outil (caractères JSON) */
export const MAX_RESULT_CHARS = 12_000;

export interface CompactOptions {
  timezone: string;
  maxItems?: number;
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * Instant → « mardi 2026-10-20 14:30 » dans le fuseau de l'organisation. Le jour est écrit en
 * toutes lettres : le modèle Live, sans raisonnement, se trompe en le déduisant d'une date.
 */
export function localDateTime(date: Date, timezone: string) {
  const z = new TZDate(date.getTime(), timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${WEEKDAYS[z.getDay()]} ${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())} ${pad(z.getHours())}:${pad(z.getMinutes())}`;
}

function isDecimalLike(value: object): value is { toFixed(): string } {
  return typeof (value as { toFixed?: unknown }).toFixed === "function" && typeof (value as { isZero?: unknown }).isZero === "function";
}

function walk(value: unknown, o: Required<CompactOptions>, depth: number): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    if (value === "") return undefined;
    if (ISO_UTC.test(value)) return localDateTime(new Date(value), o.timezone);
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (value instanceof Date) return localDateTime(value, o.timezone);
  if (isDecimalLike(value)) return value.toFixed();
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const items = value.slice(0, o.maxItems).map((v) => walk(v, o, depth + 1)).filter((v) => v !== undefined);
    if (value.length > o.maxItems) items.push(`… ${value.length - o.maxItems} autre(s) non affiché(s)`);
    return items.length ? items : undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (DROPPED_KEYS.has(k)) continue;
    const c = walk(v, o, depth + 1);
    if (c !== undefined) out[k] = c;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Compacte une valeur : dates en heure locale, décimaux en texte, valeurs vides retirées, listes
 * et textes tronqués ; réduit encore les listes tant que la réponse dépasse MAX_RESULT_CHARS.
 */
export function compact(value: unknown, options: CompactOptions): unknown {
  let maxItems = options.maxItems ?? 20;
  for (;;) {
    const result = walk(value, { timezone: options.timezone, maxItems }, 0) ?? null;
    if (JSON.stringify(result).length <= MAX_RESULT_CHARS || maxItems <= 1) return result;
    maxItems = Math.max(1, Math.floor(maxItems / 2));
  }
}
