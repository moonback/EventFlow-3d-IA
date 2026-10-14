import { returnSchema } from "@/features/reservations/schemas";
import { idSchema } from "@/lib/zod-helpers";
import { apiHandler } from "@/server/api/handler";
import { recordReturn } from "@/server/services/reservation-service";

/** POST /api/returns — retour (partiel ou total) avec contrôle. */
export const POST = apiHandler({ body: returnSchema.extend({ reservationId: idSchema }) }, ({ ctx, body }) => {
  const { reservationId, ...input } = body;
  return recordReturn(ctx, reservationId, input);
});
