import { apiHandler } from "@/server/api/handler";
import { submitReservation } from "@/server/services/reservation-service";

export const POST = apiHandler({}, ({ ctx, params }) => submitReservation(ctx, params.id!));
