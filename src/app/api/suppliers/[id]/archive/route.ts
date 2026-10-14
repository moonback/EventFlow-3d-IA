import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { setSupplierArchived } from "@/server/services/supplier-service";

export const POST = apiHandler({ body: z.object({ archived: z.boolean() }) }, async ({ ctx, params, body }) => {
  await setSupplierArchived(ctx, params.id!, body.archived);
  return { ok: true };
});
