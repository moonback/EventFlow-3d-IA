import { vehicleAssignmentStatusSchema } from "@/features/vehicles/schemas";
import { apiHandler } from "@/server/api/handler";
import { setVehicleAssignmentStatus } from "@/server/services/vehicle-service";

export const PATCH = apiHandler({ body: vehicleAssignmentStatusSchema }, ({ ctx, params, body }) => setVehicleAssignmentStatus(ctx, params.id!, body.status));
