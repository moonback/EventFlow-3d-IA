import { locationSchema } from "@/features/inventory/schemas";
import { apiHandler } from "@/server/api/handler";
import { getLocation, updateLocation } from "@/server/services/inventory-service";

export const GET = apiHandler({}, ({ ctx, params }) => getLocation(ctx, params.id!));
export const PUT = apiHandler({ body: locationSchema }, ({ ctx, params, body }) => updateLocation(ctx, params.id!, body));
