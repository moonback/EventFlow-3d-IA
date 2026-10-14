import { taskUpdateSchema } from "@/features/events/schemas";
import { apiHandler } from "@/server/api/handler";
import { updateTask } from "@/server/services/event-service";

export const PATCH = apiHandler({ body: taskUpdateSchema }, ({ ctx, params, body }) => updateTask(ctx, params.id!, body));
