import { z } from "zod";
import { purchaseOrderSchema } from "@/features/purchases/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createPurchaseOrder, listPurchaseOrders } from "@/server/services/purchase-service";

const query = listQuerySchema.extend({ status: z.enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]).optional() });

export const GET = apiHandler({ query }, ({ ctx, query }) => listPurchaseOrders(ctx, query));
export const POST = apiHandler({ body: purchaseOrderSchema }, ({ ctx, body }) => createPurchaseOrder(ctx, body));
