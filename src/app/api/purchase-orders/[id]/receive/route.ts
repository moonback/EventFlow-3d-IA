import { receiveSchema } from "@/features/purchases/schemas";
import { apiHandler } from "@/server/api/handler";
import { receivePurchaseOrder } from "@/server/services/purchase-service";

export const POST = apiHandler({ body: receiveSchema }, ({ ctx, params, body }) => receivePurchaseOrder(ctx, params.id!, body));
