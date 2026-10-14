import { categorySchema } from "@/features/inventory/schemas";
import { apiHandler } from "@/server/api/handler";
import { updateCategory } from "@/server/services/inventory-service";

export const PUT = apiHandler({ body: categorySchema }, ({ ctx, params, body }) => updateCategory(ctx, params.id!, body));
