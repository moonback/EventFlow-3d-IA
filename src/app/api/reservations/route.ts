import { z } from "zod";
import { reservationCreateSchema } from "@/features/reservations/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createReservation, listReservations } from "@/server/services/reservation-service";

const query = listQuerySchema.extend({
  status: z.enum(["DRAFT", "PENDING", "CONFIRMED", "IN_PREPARATION", "PREPARED", "SHIPPED", "PARTIALLY_RETURNED", "RETURNED", "CANCELLED"]).optional(),
  eventId: z.string().max(50).optional(),
});

export const GET = apiHandler({ query }, ({ ctx, query }) => listReservations(ctx, query));
export const POST = apiHandler({ body: reservationCreateSchema }, ({ ctx, body }) => createReservation(ctx, body));
