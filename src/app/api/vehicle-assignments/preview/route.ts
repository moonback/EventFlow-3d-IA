import { vehicleAssignmentSchema } from "@/features/vehicles/schemas";
import { apiHandler } from "@/server/api/handler";
import { previewVehicleAssignment } from "@/server/services/vehicle-service";

export const POST = apiHandler({ body: vehicleAssignmentSchema }, ({ ctx, body }) => previewVehicleAssignment(ctx, body));
