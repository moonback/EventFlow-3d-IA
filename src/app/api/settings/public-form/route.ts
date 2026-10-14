import { publicFormSettingsSchema } from "@/features/opportunities/schemas";
import { apiHandler } from "@/server/api/handler";
import { setPublicRequestFormEnabled } from "@/server/services/opportunity-service";

export const PUT = apiHandler({ body: publicFormSettingsSchema, permissions: ["settings:manage"] }, ({ ctx, body }) => setPublicRequestFormEnabled(ctx, body.enabled));
