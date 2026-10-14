import { assetSchema } from "@/features/inventory/schemas";
import { apiHandler } from "@/server/api/handler";
import { addAsset } from "@/server/services/inventory-service";

export const POST = apiHandler({ body: assetSchema }, ({ ctx, params, body }) => addAsset(ctx, params.id!, body));
