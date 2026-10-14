import { z } from "zod";
import { idSchema, money, optionalDate, optionalText } from "@/lib/zod-helpers";

export const purchaseOrderSchema = z.object({
  supplierId: idSchema,
  expectedAt: optionalDate,
  supplierInvoiceRef: optionalText(100),
  notes: optionalText(2000),
  lines: z
    .array(z.object({ productId: idSchema, quantityOrdered: z.coerce.number().int().min(1).max(100_000), unitCost: money }))
    .min(1, "Ajoutez au moins une ligne")
    .max(200),
});
export type PurchaseOrderInput = z.input<typeof purchaseOrderSchema>;

export const receiveSchema = z.object({
  notes: optionalText(1000),
  lines: z.array(z.object({ lineId: idSchema, quantity: z.coerce.number().int().min(0).max(100_000), locationId: idSchema })).min(1).max(200),
});
