import { cancelSchema } from "@/features/reservations/schemas";
import { apiHandler } from "@/server/api/handler";
import { cancelReservation } from "@/server/services/reservation-service";

export const POST = apiHandler({ body: cancelSchema }, ({ ctx, params, body }) => cancelReservation(ctx, params.id!, body.reason));
