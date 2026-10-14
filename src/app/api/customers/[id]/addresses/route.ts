import { addressSchema } from "@/features/customers/schemas";
import { apiHandler } from "@/server/api/handler";
import { addAddress } from "@/server/services/customer-service";

export const POST = apiHandler({ body: addressSchema }, ({ ctx, params, body }) => addAddress(ctx, params.id!, body));
