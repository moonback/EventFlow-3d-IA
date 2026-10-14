/**
 * Arguments communs des outils d'Eric (Zod) : identifiants, textes et dates exprimées dans le
 * fuseau de l'agence. Les descriptions sont lues par le modèle.
 */
import { z, type ZodType } from "zod";
import { addDays, zonedLocalToUtc } from "@/lib/dates";

export const idArg = (what: string) => z.string().trim().min(1).max(64).describe(`Identifiant ${what} (obtenu par search ou un outil list_*)`);
export const textArg = (what: string, max = 100) => z.string().trim().min(1).max(max).describe(what);

/** Refuse les dates impossibles (« 2031-02-30 ») au lieu de les reporter au mois suivant. */
export function isCalendarDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const dateArg = (what: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "Format AAAA-MM-JJ ou AAAA-MM-JJTHH:MM")
    .refine(isCalendarDate, "Date inexistante")
    .describe(`${what} (AAAA-MM-JJ, heure locale de l'agence)`);

/** « 2026-10-20 » → début de journée locale ; avec `endOfDay`, fin de cette journée. */
export function parseDate(value: string, timezone: string, endOfDay = false): Date {
  const local = value.includes("T") ? value : `${value}T00:00`;
  const date = zonedLocalToUtc(local, timezone);
  return endOfDay && !value.includes("T") ? addDays(date, 1) : date;
}

/** Déclaration Gemini d'un outil à partir de son schéma Zod. */
export function declaration(name: string, description: string, input: ZodType) {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(input, { io: "input" }) as Record<string, unknown>;
  return { name, description, parametersJsonSchema: parameters };
}
