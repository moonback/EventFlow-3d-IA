import { stockCountSchema } from "@/features/inventory/schemas";
import { apiHandler } from "@/server/api/handler";
import { recordStockCount } from "@/server/services/inventory-service";

export const POST = apiHandler({ body: stockCountSchema }, ({ ctx, body }) => recordStockCount(ctx, body));
