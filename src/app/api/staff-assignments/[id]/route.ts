import { staffAssignmentStatusSchema } from "@/features/staff/schemas";
import { apiHandler } from "@/server/api/handler";
import { setStaffAssignmentStatus } from "@/server/services/staff-service";

export const PATCH = apiHandler({ body: staffAssignmentStatusSchema }, ({ ctx, params, body }) => setStaffAssignmentStatus(ctx, params.id!, body.status));
