import { shipSchema } from "@/features/reservations/schemas";
import { apiHandler } from "@/server/api/handler";
import { shipReservation } from "@/server/services/reservation-service";

export const POST = apiHandler({ body: shipSchema }, ({ ctx, params, body }) => shipReservation(ctx, params.id!, body));
