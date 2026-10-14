import { supplierContactSchema } from "@/features/suppliers/schemas";
import { apiHandler } from "@/server/api/handler";
import { addSupplierContact } from "@/server/services/supplier-service";

export const POST = apiHandler({ body: supplierContactSchema }, ({ ctx, params, body }) => addSupplierContact(ctx, params.id!, body));
