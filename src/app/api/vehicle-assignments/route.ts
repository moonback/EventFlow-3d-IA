import { vehicleAssignmentSchema } from "@/features/vehicles/schemas";
import { apiHandler } from "@/server/api/handler";
import { createVehicleAssignment } from "@/server/services/vehicle-service";

export const POST = apiHandler({ body: vehicleAssignmentSchema }, ({ ctx, body }) => createVehicleAssignment(ctx, body));
