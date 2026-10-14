import { apiHandler } from "@/server/api/handler";
import { confirmReservation } from "@/server/services/reservation-service";

export const POST = apiHandler({}, ({ ctx, params }) => confirmReservation(ctx, params.id!));
