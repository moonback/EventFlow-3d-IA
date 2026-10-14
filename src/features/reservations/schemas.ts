import { z } from "zod";

const id = z.string().min(1).max(50);
const qty = z.coerce.number().int().min(1, "Quantité ≥ 1").max(100_000);
const qty0 = z.coerce.number().int().min(0).max(100_000);

export const reservationLineSchema = z.object({ productId: id, quantity: qty, notes: z.string().max(500).optional() });

export const reservationCreateSchema = z.object({
  eventId: id,
  /** Instants ISO ; par défaut la période de l'événement (montage → démontage) */
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  prepBufferHours: z.coerce.number().int().min(0).max(720).optional(),
  returnBufferHours: z.coerce.number().int().min(0).max(720).optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(reservationLineSchema).min(1, "Ajoutez au moins une référence").max(300),
});
export type ReservationCreateInput = z.infer<typeof reservationCreateSchema>;

export const reservationUpdateSchema = reservationCreateSchema.omit({ eventId: true }).partial().extend({
  lines: z.array(reservationLineSchema).min(1).max(300).optional(),
});
export type ReservationUpdateInput = z.infer<typeof reservationUpdateSchema>;

export const cancelSchema = z.object({ reason: z.string().trim().min(3, "Motif obligatoire").max(500) });

export const prepareSchema = z.object({
  preparationLocationId: id.optional(),
  lines: z
    .array(z.object({ productId: id, fromLocationId: id, quantity: qty }))
    .min(1)
    .max(300),
});
export type PrepareInput = z.infer<typeof prepareSchema>;

export const unprepareSchema = z.object({
  lines: z.array(z.object({ productId: id, toLocationId: id, quantity: qty })).min(1).max(300),
});

export const shipSchema = z.object({
  /** Expédier même si la préparation est incomplète (anomalie signalée) */
  allowIncomplete: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});

export const returnSchema = z.object({
  returnLocationId: id.optional(),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(z.object({ productId: id, quantityGood: qty0, quantityDamaged: qty0, anomaly: z.string().max(500).optional() }))
    .min(1)
    .max(300),
});
export type ReturnInput = z.infer<typeof returnSchema>;

export const lossSchema = z.object({ productId: id, quantity: qty, reason: z.string().trim().min(3).max(500) });

export const availabilityQuerySchema = z.object({
  productIds: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(id).min(1).max(300)),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  excludeReservationId: id.optional(),
});
