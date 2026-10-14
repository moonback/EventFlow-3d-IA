import { notificationPrefsSchema } from "@/features/settings/schemas";
import { apiHandler } from "@/server/api/handler";
import { getNotificationPreferences, saveNotificationPreferences } from "@/server/services/notification-service";

export const GET = apiHandler({}, ({ ctx }) => getNotificationPreferences(ctx));
export const PUT = apiHandler({ body: notificationPrefsSchema }, async ({ ctx, body }) => {
  await saveNotificationPreferences(ctx, body.preferences);
  return { ok: true };
});
