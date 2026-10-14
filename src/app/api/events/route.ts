import { z } from "zod";
import { EVENT_STATUSES, eventSchema } from "@/features/events/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createEvent, listEvents } from "@/server/services/event-service";

const query = listQuerySchema.extend({
  status: z.enum(EVENT_STATUSES).optional(),
  customerId: z.string().max(50).optional(),
  eventTypeId: z.string().max(50).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const GET = apiHandler({ query }, ({ ctx, query }) => listEvents(ctx, query));
export const POST = apiHandler({ body: eventSchema }, ({ ctx, body }) => createEvent(ctx, body));
