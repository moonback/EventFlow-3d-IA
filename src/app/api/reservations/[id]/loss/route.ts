import { lossSchema } from "@/features/reservations/schemas";
import { apiHandler } from "@/server/api/handler";
import { declareLoss } from "@/server/services/reservation-service";

export const POST = apiHandler({ body: lossSchema }, ({ ctx, params, body }) => declareLoss(ctx, params.id!, body));
