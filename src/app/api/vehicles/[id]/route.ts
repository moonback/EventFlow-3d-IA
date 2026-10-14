import { vehicleSchema } from "@/features/vehicles/schemas";
import { apiHandler } from "@/server/api/handler";
import { getVehicle, updateVehicle } from "@/server/services/vehicle-service";

export const GET = apiHandler({}, ({ ctx, params }) => getVehicle(ctx, params.id!));
export const PUT = apiHandler({ body: vehicleSchema }, ({ ctx, params, body }) => updateVehicle(ctx, params.id!, body));
