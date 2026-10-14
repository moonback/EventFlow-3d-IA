import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { DASHBOARD_WIDGETS, saveDashboardWidgets } from "@/server/services/dashboard-service";

export const PUT = apiHandler({ body: z.object({ widgets: z.array(z.enum(DASHBOARD_WIDGETS)).max(20) }) }, async ({ ctx, body }) => {
  await saveDashboardWidgets(ctx, body.widgets);
  return { ok: true };
});
