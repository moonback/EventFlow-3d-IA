import { vehicleMaintenanceSchema } from "@/features/vehicles/schemas";
import { apiHandler } from "@/server/api/handler";
import { addVehicleMaintenance } from "@/server/services/vehicle-service";

export const POST = apiHandler({ body: vehicleMaintenanceSchema }, ({ ctx, params, body }) => addVehicleMaintenance(ctx, params.id!, body));
