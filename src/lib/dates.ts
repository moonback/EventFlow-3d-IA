import { TZDate } from "@date-fns/tz";

/**
 * Gestion des fuseaux horaires.
 * - Stockage : instants UTC (timestamptz).
 * - Saisie : les formulaires envoient une heure locale "YYYY-MM-DDTHH:mm" + un fuseau IANA,
 *   convertie côté serveur en instant UTC (changements d'heure pris en compte).
 * - Affichage : dans le fuseau de l'événement (ou de l'organisation).
 */
export const DEFAULT_TIMEZONE = "Europe/Paris";
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isLocalDateTimeString(value: string): boolean {
  return LOCAL_RE.test(value);
}

/** Convertit une heure murale locale (dans `timezone`) en instant UTC. */
export function zonedLocalToUtc(local: string, timezone: string): Date {
  const m = LOCAL_RE.exec(local);
  if (!m) throw new RangeError(`Format de date locale invalide : ${local}`);
  const [, y, mo, d, h, mi, s] = m;
  const date = new TZDate(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0), timezone);
  return new Date(date.getTime());
}

/** Formate un instant pour un champ <input type="datetime-local"> dans le fuseau donné. */
export function utcToZonedLocalInput(date: Date | string, timezone: string): string {
  const z = new TZDate(new Date(date).getTime(), timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}T${pad(z.getHours())}:${pad(z.getMinutes())}`;
}

export function formatDateTime(date: Date | string | null | undefined, timezone = DEFAULT_TIMEZONE): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatDate(date: Date | string | null | undefined, timezone = DEFAULT_TIMEZONE): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, dateStyle: "medium" }).format(new Date(date));
}

export function formatTime(date: Date | string | null | undefined, timezone = DEFAULT_TIMEZONE): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, timeStyle: "short" }).format(new Date(date));
}

/** Deux intervalles semi-ouverts [aStart, aEnd) et [bStart, bEnd) se chevauchent-ils ? */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Début de journée (00:00) dans le fuseau donné, renvoyé en instant UTC. */
export function startOfDayInZone(date: Date, timezone: string): Date {
  const z = new TZDate(date.getTime(), timezone);
  return new Date(new TZDate(z.getFullYear(), z.getMonth(), z.getDate(), 0, 0, 0, timezone).getTime());
}
