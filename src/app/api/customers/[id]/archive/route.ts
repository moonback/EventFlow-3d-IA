import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { setCustomerArchived } from "@/server/services/customer-service";

export const POST = apiHandler({ body: z.object({ archived: z.boolean() }) }, async ({ ctx, params, body }) => {
  await setCustomerArchived(ctx, params.id!, body.archived);
  return { ok: true };
});
