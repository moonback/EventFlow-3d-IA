import { timesheetSchema } from "@/features/staff/schemas";
import { apiHandler } from "@/server/api/handler";
import { addTimesheet } from "@/server/services/staff-service";

export const POST = apiHandler({ body: timesheetSchema }, ({ ctx, params, body }) => addTimesheet(ctx, params.id!, body));
