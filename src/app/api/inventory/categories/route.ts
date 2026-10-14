import { categorySchema } from "@/features/inventory/schemas";
import { apiHandler } from "@/server/api/handler";
import { createCategory, listCategories } from "@/server/services/inventory-service";

export const GET = apiHandler({}, ({ ctx }) => listCategories(ctx));
export const POST = apiHandler({ body: categorySchema }, ({ ctx, body }) => createCategory(ctx, body));
