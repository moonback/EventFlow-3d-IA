import { customerSchema } from "@/features/customers/schemas";
import { apiHandler } from "@/server/api/handler";
import { getCustomer, updateCustomer } from "@/server/services/customer-service";

export const GET = apiHandler({}, ({ ctx, params }) => getCustomer(ctx, params.id!));
export const PUT = apiHandler({ body: customerSchema }, ({ ctx, params, body }) => updateCustomer(ctx, params.id!, body));
