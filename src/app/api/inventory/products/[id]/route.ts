import { productSchema } from "@/features/inventory/schemas";
import { apiHandler } from "@/server/api/handler";
import { getProduct, updateProduct } from "@/server/services/inventory-service";

export const GET = apiHandler({}, ({ ctx, params }) => getProduct(ctx, params.id!));
export const PUT = apiHandler({ body: productSchema }, ({ ctx, params, body }) => updateProduct(ctx, params.id!, body));
