import { staffSchema } from "@/features/staff/schemas";
import { apiHandler } from "@/server/api/handler";
import { getStaffMember, updateStaffMember } from "@/server/services/staff-service";

export const GET = apiHandler({}, ({ ctx, params }) => getStaffMember(ctx, params.id!));
export const PUT = apiHandler({ body: staffSchema }, ({ ctx, params, body }) => updateStaffMember(ctx, params.id!, body));
