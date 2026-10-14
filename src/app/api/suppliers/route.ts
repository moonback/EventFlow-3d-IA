import { z } from "zod";
import { supplierSchema } from "@/features/suppliers/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createSupplier, listSuppliers } from "@/server/services/supplier-service";

const query = listQuerySchema.extend({ archived: z.enum(["true", "false"]).optional() });

export const GET = apiHandler({ query }, ({ ctx, query }) => listSuppliers(ctx, { ...query, archived: query.archived === "true" }));
export const POST = apiHandler({ body: supplierSchema }, ({ ctx, body }) => createSupplier(ctx, body));
