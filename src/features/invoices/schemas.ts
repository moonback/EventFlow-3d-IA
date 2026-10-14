import { z } from "zod";
import { decimalString, idSchema, optionalId, optionalText, requiredText, money } from "@/lib/zod-helpers";
import { documentLineSchema } from "../quotes/schemas";

export const invoiceSchema = z.object({
  customerId: idSchema,
  eventId: optionalId,
  title: requiredText(200),
  globalDiscountPercent: decimalString(2).refine((v) => Number(v) >= 0 && Number(v) <= 100, "Entre 0 et 100").default("0"),
  notes: optionalText(5000),
  lines: z.array(documentLineSchema).min(1, "Ajoutez au moins une ligne").max(300),
});
export type InvoiceFormInput = z.input<typeof invoiceSchema>;

export const paymentSchema = z.object({
  invoiceId: idSchema,
  amount: money.refine((v) => Number(v) > 0, "Montant > 0"),
  method: z.enum(["BANK_TRANSFER", "CARD", "CHECK", "CASH", "OTHER"]),
  paidAt: z.coerce.date(),
  reference: optionalText(100),
  notes: optionalText(500),
});

export const creditNoteSchema = z.object({
  reason: requiredText(500),
  /** Avoir total (copie de toutes les lignes) ou partiel (lignes saisies) */
  lines: z.array(documentLineSchema).max(300).optional(),
});

export const expenseSchema = z.object({
  category: z.enum(["EQUIPMENT_RENTAL", "PURCHASE", "TRANSPORT", "FUEL", "LABOR", "SUBCONTRACTING", "CATERING", "VENUE", "MAINTENANCE", "INSURANCE", "OTHER"]),
  description: requiredText(300),
  amountExclTax: money.refine((v) => Number(v) >= 0, "Montant ≥ 0"),
  vatRate: decimalString(2).default("20"),
  incurredAt: z.coerce.date(),
  eventId: optionalId,
  vehicleId: optionalId,
  supplierId: optionalId,
  supplierInvoiceRef: optionalText(100),
});
