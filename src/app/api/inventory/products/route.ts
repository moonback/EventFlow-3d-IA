import { z } from "zod";
import { productSchema } from "@/features/inventory/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createProduct, listProducts } from "@/server/services/inventory-service";

const query = listQuerySchema.extend({
  categoryId: z.string().max(50).optional(),
  locationId: z.string().max(50).optional(),
  archived: z.enum(["true", "false"]).optional(),
  lowStock: z.enum(["true", "false"]).optional(),
});

export const GET = apiHandler({ query }, ({ ctx, query }) =>
  listProducts(ctx, { ...query, archived: query.archived === "true", lowStock: query.lowStock === "true" }),
);
export const POST = apiHandler({ body: productSchema }, ({ ctx, body }) => createProduct(ctx, body));
