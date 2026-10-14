import { prepareSchema } from "@/features/reservations/schemas";
import { apiHandler } from "@/server/api/handler";
import { prepareReservation } from "@/server/services/reservation-service";

export const POST = apiHandler({ body: prepareSchema }, ({ ctx, params, body }) => prepareReservation(ctx, params.id!, body));
