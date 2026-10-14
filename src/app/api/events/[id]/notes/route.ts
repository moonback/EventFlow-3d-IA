import { eventNoteSchema } from "@/features/events/schemas";
import { apiHandler } from "@/server/api/handler";
import { addEventNote } from "@/server/services/event-service";

export const POST = apiHandler({ body: eventNoteSchema }, ({ ctx, params, body }) => addEventNote(ctx, params.id!, body));
