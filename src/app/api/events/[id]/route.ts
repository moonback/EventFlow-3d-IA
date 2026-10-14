import { eventSchema } from "@/features/events/schemas";
import { apiHandler } from "@/server/api/handler";
import { getEvent, updateEvent } from "@/server/services/event-service";

export const GET = apiHandler({}, ({ ctx, params }) => getEvent(ctx, params.id!));
export const PUT = apiHandler({ body: eventSchema }, ({ ctx, params, body }) => updateEvent(ctx, params.id!, body));
