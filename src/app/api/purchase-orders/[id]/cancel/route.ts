import { apiHandler } from "@/server/api/handler";
import { cancelPurchaseOrder } from "@/server/services/purchase-service";

export const POST = apiHandler({}, ({ ctx, params }) => cancelPurchaseOrder(ctx, params.id!));
