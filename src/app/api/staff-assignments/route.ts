import { staffAssignmentSchema } from "@/features/staff/schemas";
import { apiHandler } from "@/server/api/handler";
import { createStaffAssignment } from "@/server/services/staff-service";

export const POST = apiHandler({ body: staffAssignmentSchema }, ({ ctx, body }) => createStaffAssignment(ctx, body));
