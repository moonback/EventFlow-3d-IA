import { unprepareSchema } from "@/features/reservations/schemas";
import { apiHandler } from "@/server/api/handler";
import { unprepareReservation } from "@/server/services/reservation-service";

export const POST = apiHandler({ body: unprepareSchema }, ({ ctx, params, body }) => unprepareReservation(ctx, params.id!, body));
