import { apiHandler } from "@/server/api/handler";
import { deleteAddress } from "@/server/services/customer-service";

export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await deleteAddress(ctx, params.id!, params.addressId!);
  return { ok: true };
});
