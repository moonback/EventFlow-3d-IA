import { reverseMovementSchema } from "@/features/inventory/schemas";
import { apiHandler } from "@/server/api/handler";
import { reverseMovement } from "@/server/services/stock-movement-service";

export const POST = apiHandler({ body: reverseMovementSchema }, ({ ctx, params, body }) => reverseMovement(ctx, params.id!, body.reason));
