import { z } from "zod";
import { isLocalDateTimeString, isValidTimezone } from "./dates";

/** Texte facultatif : chaîne vide → null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const requiredText = (max = 200, message = "Champ obligatoire") => z.string().trim().min(1, message).max(max);

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Adresse e-mail invalide");

export const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .optional()
  .nullable()
  .transform((v) => (v ? v.replace(/\s+/g, " ") : null))
  .refine((v) => v === null || /^[+0-9 ().-]{6,30}$/.test(v), "Numéro de téléphone invalide");

/** Montant décimal positif saisi en texte ("1234,50" accepté) → chaîne normalisée "1234.50" ou null. */
export const optionalMoney = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === undefined || v === null || v === "") return null;
    const s = String(v).replace(/\s/g, "").replace(",", ".");
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Montant invalide (2 décimales max)" });
      return z.NEVER;
    }
    return s;
  });

export const money = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(s)) {
    ctx.addIssue({ code: "custom", message: "Montant invalide (2 décimales max)" });
    return z.NEVER;
  }
  return s;
});

export const decimalString = (maxDecimals: number, allowNegative = false) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const s = String(v).replace(/\s/g, "").replace(",", ".");
    const re = new RegExp(`^${allowNegative ? "-?" : ""}\\d{1,10}(\\.\\d{1,${maxDecimals}})?$`);
    if (!re.test(s)) {
      ctx.addIssue({ code: "custom", message: `Nombre invalide (${maxDecimals} décimales max)` });
      return z.NEVER;
    }
    return s;
  });

export const optionalDecimal = (maxDecimals: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === undefined || v === null || v === "") return null;
      const s = String(v).replace(/\s/g, "").replace(",", ".");
      if (!new RegExp(`^\\d{1,10}(\\.\\d{1,${maxDecimals}})?$`).test(s)) {
        ctx.addIssue({ code: "custom", message: "Nombre invalide" });
        return z.NEVER;
      }
      return s;
    });

export const optionalInt = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) {
      ctx.addIssue({ code: "custom", message: "Entier positif attendu" });
      return z.NEVER;
    }
    return n;
  });

export const timezone = z.string().refine(isValidTimezone, "Fuseau horaire inconnu");
export const localDateTime = z.string().refine(isLocalDateTimeString, "Date/heure invalide");
export const optionalLocalDateTime = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isLocalDateTimeString(v), "Date/heure invalide");

export const optionalDate = z
  .union([z.string(), z.date()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === undefined || v === null || v === "") return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Date invalide" });
      return z.NEVER;
    }
    return d;
  });

export const idSchema = z.string().min(1).max(50);
export const optionalId = z
  .string()
  .max(50)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
