import { z } from "zod";
import { decimalString, idSchema, optionalDate, optionalId, optionalText, requiredText } from "@/lib/zod-helpers";

export const LINE_KINDS = ["EQUIPMENT", "LABOR", "TRANSPORT", "SERVICE", "OTHER"] as const;

const percent = decimalString(2).refine((v) => Number(v) >= 0 && Number(v) <= 100, "Entre 0 et 100");

export const documentLineSchema = z.object({
  kind: z.enum(LINE_KINDS),
  productId: optionalId,
  description: requiredText(500),
  quantity: decimalString(3).refine((v) => Number(v) > 0, "Quantité > 0"),
  days: decimalString(2).refine((v) => Number(v) > 0, "Jours > 0").default("1"),
  unitPrice: decimalString(2),
  discountPercent: percent.default("0"),
  vatRate: percent,
});
export type DocumentLineInput = z.input<typeof documentLineSchema>;

export const quoteSchema = z.object({
  customerId: idSchema,
  eventId: optionalId,
  title: requiredText(200),
  validUntil: optionalDate,
  globalDiscountPercent: percent.default("0"),
  notes: optionalText(5000),
  terms: optionalText(5000),
  lines: z.array(documentLineSchema).min(1, "Ajoutez au moins une ligne").max(300),
});
export type QuoteFormInput = z.input<typeof quoteSchema>;

export const quoteAcceptSchema = z.object({ createReservation: z.boolean().default(true) });
