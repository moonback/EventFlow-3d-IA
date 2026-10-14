import { switchOrganizationSchema } from "@/features/auth/schemas";
import { apiHandler } from "@/server/api/handler";
import { switchOrganization } from "@/server/services/auth-service";

export const POST = apiHandler({ body: switchOrganizationSchema }, async ({ ctx, body }) => {
  await switchOrganization(ctx, body.organizationId);
  return { ok: true };
});
