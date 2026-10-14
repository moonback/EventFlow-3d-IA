import { supplierSchema } from "@/features/suppliers/schemas";
import { apiHandler } from "@/server/api/handler";
import { getSupplier, updateSupplier } from "@/server/services/supplier-service";

export const GET = apiHandler({}, ({ ctx, params }) => getSupplier(ctx, params.id!));
export const PUT = apiHandler({ body: supplierSchema }, ({ ctx, params, body }) => updateSupplier(ctx, params.id!, body));
