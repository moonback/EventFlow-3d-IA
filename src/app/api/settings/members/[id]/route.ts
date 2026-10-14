import { memberUpdateSchema } from "@/features/settings/schemas";
import { apiHandler } from "@/server/api/handler";
import { updateMemberRole } from "@/server/services/auth-service";

export const PATCH = apiHandler({ body: memberUpdateSchema }, async ({ ctx, params, body }) => {
  await updateMemberRole(ctx, params.id!, body.role, body.isActive);
  return { ok: true };
});
