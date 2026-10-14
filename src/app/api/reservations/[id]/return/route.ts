import { returnSchema } from "@/features/reservations/schemas";
import { apiHandler } from "@/server/api/handler";
import { recordReturn } from "@/server/services/reservation-service";

export const POST = apiHandler({ body: returnSchema }, ({ ctx, params, body }) => recordReturn(ctx, params.id!, body));
