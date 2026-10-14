import { eventTypeSchema } from "@/features/events/schemas";
import { apiHandler } from "@/server/api/handler";
import { createEventType, listEventTypes } from "@/server/services/event-service";

export const GET = apiHandler({}, ({ ctx }) => listEventTypes(ctx));
export const POST = apiHandler({ body: eventTypeSchema }, ({ ctx, body }) => createEventType(ctx, body));
