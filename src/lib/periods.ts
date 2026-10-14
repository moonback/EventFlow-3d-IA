import { TZDate } from "@date-fns/tz";

/** Périodes prédéfinies (dates locales AAAA-MM-JJ, borne de fin exclue) dans le fuseau donné. */
export function periodPresets(timezone: string) {
  const now = new TZDate(Date.now(), timezone);
  const d = (y: number, m: number, day: number) => {
    const t = new TZDate(y, m, day, timezone);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3) * 3;
  return [
    { label: "Ce mois", from: d(y, m, 1), to: d(y, m + 1, 1) },
    { label: "Mois dernier", from: d(y, m - 1, 1), to: d(y, m, 1) },
    { label: "Ce trimestre", from: d(y, q, 1), to: d(y, q + 3, 1) },
    { label: "Cette année", from: d(y, 0, 1), to: d(y + 1, 0, 1) },
    { label: "90 prochains jours", from: d(y, m, now.getDate()), to: d(y, m, now.getDate() + 90) },
  ];
}

/** Convertit une date locale AAAA-MM-JJ en instant UTC (minuit local). */
export function localDayToUtc(day: string, timezone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(new TZDate(y!, m! - 1, d!, 0, 0, 0, timezone).getTime());
}

export function isDay(v: string | undefined): v is string {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}
