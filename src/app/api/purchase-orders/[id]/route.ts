import { purchaseOrderSchema } from "@/features/purchases/schemas";
import { apiHandler } from "@/server/api/handler";
import { getPurchaseOrder, updatePurchaseOrder } from "@/server/services/purchase-service";

export const GET = apiHandler({}, ({ ctx, params }) => getPurchaseOrder(ctx, params.id!));
export const PUT = apiHandler({ body: purchaseOrderSchema }, ({ ctx, params, body }) => updatePurchaseOrder(ctx, params.id!, body));
