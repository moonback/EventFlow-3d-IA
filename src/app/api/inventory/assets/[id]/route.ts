import { assetStatusSchema } from "@/features/inventory/schemas";
import { apiHandler } from "@/server/api/handler";
import { setAssetStatus } from "@/server/services/inventory-service";

export const PATCH = apiHandler({ body: assetStatusSchema }, async ({ ctx, params, body }) => {
  await setAssetStatus(ctx, params.id!, body.status);
  return { ok: true };
});
