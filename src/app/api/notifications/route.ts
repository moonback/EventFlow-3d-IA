import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { listNotifications } from "@/server/services/notification-service";

export const GET = apiHandler({ query: z.object({ unread: z.enum(["true", "false"]).optional() }) }, ({ ctx, query }) => listNotifications(ctx, { unreadOnly: query.unread === "true" }));
