import { assistantSettingsSchema } from "@/features/settings/schemas";
import { apiHandler } from "@/server/api/handler";
import { getAssistantSettings, updateAssistantSettings } from "@/server/services/settings-service";

export const GET = apiHandler({ permissions: ["settings:manage"] }, ({ ctx }) => getAssistantSettings(ctx));
export const PUT = apiHandler({ body: assistantSettingsSchema, permissions: ["settings:manage"] }, ({ ctx, body }) => updateAssistantSettings(ctx, body));
