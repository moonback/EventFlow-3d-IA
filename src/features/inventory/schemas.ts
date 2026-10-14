import { z } from "zod";
import { idSchema, optionalDecimal, optionalId, optionalInt, optionalMoney, optionalText, requiredText } from "@/lib/zod-helpers";

export const LOCATION_KINDS = ["WAREHOUSE", "ZONE", "RACK", "BIN", "PREPARATION", "RETURN", "QUARANTINE", "MAINTENANCE", "OUT"] as const;

export const categorySchema = z.object({
  name: requiredText(100),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,20}$/, "Code : 2 à 20 caractères A-Z, 0-9, - ou _"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b"),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export const productSchema = z.object({
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9._\-/]{2,40}$/, "SKU : 2 à 40 caractères (A-Z, 0-9, . _ - /)"),
  barcode: optionalText(64),
  name: requiredText(200),
  description: optionalText(5000),
  categoryId: idSchema,
  unit: z.string().trim().min(1).max(20).default("unité"),
  stockManaged: z.boolean().default(true),
  serialized: z.boolean().default(false),
  alertThreshold: z.coerce.number().int().min(0).max(100_000).default(0),
  purchasePrice: optionalMoney,
  rentalPrice: optionalMoney,
  replacementValue: optionalMoney,
  supplierId: optionalId,
  weightKg: optionalDecimal(3),
  volumeM3: optionalDecimal(4),
  lengthCm: optionalInt,
  widthCm: optionalInt,
  heightCm: optionalInt,
  defaultLocationId: optionalId,
});
export type ProductFormInput = z.input<typeof productSchema>;

export const locationSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9._\-]{1,30}$/, "Code : 1 à 30 caractères (A-Z, 0-9, . _ -)"),
  name: requiredText(100),
  kind: z.enum(LOCATION_KINDS),
  parentId: optionalId,
  description: optionalText(500),
  isActive: z.boolean().default(true),
});

export const assetSchema = z.object({
  serialNumber: requiredText(100),
  locationId: optionalId,
  purchasedAt: z.coerce.date().optional().nullable(),
  notes: optionalText(1000),
});

export const assetStatusSchema = z.object({ status: z.enum(["AVAILABLE", "OUT", "DAMAGED", "MAINTENANCE", "LOST", "RETIRED"]) });

export const manualMovementSchema = z.object({
  type: z.enum(["RECEIPT", "TRANSFER", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "LOSS"]),
  productId: idSchema,
  quantity: z.coerce.number().int().min(1).max(100_000),
  fromLocationId: optionalId,
  toLocationId: optionalId,
  reason: z.string().trim().max(500).default(""),
});

export const reverseMovementSchema = z.object({ reason: z.string().trim().min(3, "Motif obligatoire").max(500) });

/** Inventaire : saisie des quantités comptées par emplacement ; les écarts génèrent des ajustements. */
export const stockCountSchema = z.object({
  locationId: idSchema,
  reason: z.string().trim().min(3, "Motif obligatoire").max(500),
  counts: z.array(z.object({ productId: idSchema, countedQuantity: z.coerce.number().int().min(0).max(1_000_000) })).min(1).max(500),
});
