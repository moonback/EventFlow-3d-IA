import { reservationUpdateSchema } from "@/features/reservations/schemas";
import { apiHandler } from "@/server/api/handler";
import { getReservation, updateReservation } from "@/server/services/reservation-service";

export const GET = apiHandler({}, ({ ctx, params }) => getReservation(ctx, params.id!));
export const PATCH = apiHandler({ body: reservationUpdateSchema }, ({ ctx, params, body }) => updateReservation(ctx, params.id!, body));
