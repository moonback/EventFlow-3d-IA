import { maintenanceResolveSchema } from "@/features/maintenance/schemas";
import { apiHandler } from "@/server/api/handler";
import { resolveMaintenance } from "@/server/services/maintenance-service";

export const POST = apiHandler({ body: maintenanceResolveSchema }, ({ ctx, params, body }) => resolveMaintenance(ctx, params.id!, body));
