import { prepareSchema } from "@/features/reservations/schemas";
import { idSchema } from "@/lib/zod-helpers";
import { apiHandler } from "@/server/api/handler";
import { prepareReservation } from "@/server/services/reservation-service";

/** POST /api/preparations — prélèvement de matériel pour une réservation confirmée. */
export const POST = apiHandler({ body: prepareSchema.extend({ reservationId: idSchema }) }, ({ ctx, body }) => {
  const { reservationId, ...input } = body;
  return prepareReservation(ctx, reservationId, input);
});
