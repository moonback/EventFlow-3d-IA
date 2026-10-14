import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { markNotificationsRead } from "@/server/services/notification-service";

export const POST = apiHandler({ body: z.object({ ids: z.union([z.literal("all"), z.array(z.string().max(50)).max(200)]) }) }, ({ ctx, body }) => markNotificationsRead(ctx, body.ids));
