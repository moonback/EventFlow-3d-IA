import { z } from "zod";
import { idSchema, optionalMoney, optionalText, requiredText } from "@/lib/zod-helpers";

/** Mise en maintenance manuelle depuis un emplacement de stockage. */
export const maintenanceCreateSchema = z.object({
  productId: idSchema,
  fromLocationId: idSchema,
  quantity: z.coerce.number().int().min(1).max(100_000),
  title: requiredText(200),
  description: optionalText(5000),
});

export const maintenanceStartSchema = z.object({ notes: optionalText(1000) });

export const maintenanceResolveSchema = z
  .object({
    quantityRepaired: z.coerce.number().int().min(0).max(100_000),
    quantityScrapped: z.coerce.number().int().min(0).max(100_000),
    toLocationId: z.string().max(50).optional().nullable(),
    cost: optionalMoney,
    notes: optionalText(2000),
  })
  .refine((v) => v.quantityRepaired + v.quantityScrapped > 0, { message: "Saisissez une quantité réparée ou mise au rebut", path: ["quantityRepaired"] })
  .refine((v) => v.quantityRepaired === 0 || Boolean(v.toLocationId), { message: "Emplacement de remise en stock requis", path: ["toLocationId"] });
