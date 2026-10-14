import { z } from "zod";
import { vehicleSchema } from "@/features/vehicles/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createVehicle, listVehicles } from "@/server/services/vehicle-service";

const query = listQuerySchema.extend({ ops: z.enum(["AVAILABLE", "ASSIGNED", "ON_MISSION", "MAINTENANCE", "UNAVAILABLE"]).optional() });

export const GET = apiHandler({ query }, ({ ctx, query }) => listVehicles(ctx, query));
export const POST = apiHandler({ body: vehicleSchema }, ({ ctx, body }) => createVehicle(ctx, body));
