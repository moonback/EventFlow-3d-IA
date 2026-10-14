import { apiHandler } from "@/server/api/handler";
import { placePurchaseOrder } from "@/server/services/purchase-service";

export const POST = apiHandler({}, ({ ctx, params }) => placePurchaseOrder(ctx, params.id!));
