import { organizationSettingsSchema } from "@/features/settings/schemas";
import { apiHandler } from "@/server/api/handler";
import { getOrganizationSettings, updateOrganizationSettings } from "@/server/services/settings-service";

export const GET = apiHandler({}, ({ ctx }) => getOrganizationSettings(ctx));
export const PUT = apiHandler({ body: organizationSettingsSchema }, async ({ ctx, body }) => {
  await updateOrganizationSettings(ctx, body);
  return { ok: true };
});
