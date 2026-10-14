import { unavailabilitySchema } from "@/features/staff/schemas";
import { apiHandler } from "@/server/api/handler";
import { addUnavailability } from "@/server/services/staff-service";

export const POST = apiHandler({ body: unavailabilitySchema }, ({ ctx, params, body }) => addUnavailability(ctx, params.id!, body));
