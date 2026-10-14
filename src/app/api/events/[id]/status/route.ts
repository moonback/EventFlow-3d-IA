import { eventStatusSchema } from "@/features/events/schemas";
import { apiHandler } from "@/server/api/handler";
import { changeEventStatus } from "@/server/services/event-service";

export const POST = apiHandler({ body: eventStatusSchema }, ({ ctx, params, body }) => changeEventStatus(ctx, params.id!, body.status, body.reason));
