import { z } from "zod";
import { optionalInt, optionalMoney } from "@/lib/zod-helpers";
import { apiHandler } from "@/server/api/handler";
import { completeVehicleMaintenance } from "@/server/services/vehicle-service";

export const POST = apiHandler({ body: z.object({ cost: optionalMoney, mileageKm: optionalInt }) }, ({ ctx, params, body }) => completeVehicleMaintenance(ctx, params.id!, body));
