import { locationSchema } from "@/features/inventory/schemas";
import { apiHandler } from "@/server/api/handler";
import { createLocation, listLocations } from "@/server/services/inventory-service";

export const GET = apiHandler({}, ({ ctx }) => listLocations(ctx));
export const POST = apiHandler({ body: locationSchema }, ({ ctx, body }) => createLocation(ctx, body));
