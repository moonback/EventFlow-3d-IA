import { z } from "zod";
import { taskSchema } from "@/features/events/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createTask, listTasks } from "@/server/services/event-service";

const query = listQuerySchema.extend({
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  mine: z.enum(["true", "false"]).optional(),
  eventId: z.string().max(50).optional(),
});

export const GET = apiHandler({ query }, ({ ctx, query }) => listTasks(ctx, { ...query, overdue: query.overdue === "true", mine: query.mine === "true" }));
export const POST = apiHandler({ body: taskSchema }, ({ ctx, body }) => createTask(ctx, body));
