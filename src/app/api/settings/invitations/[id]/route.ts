import { apiHandler } from "@/server/api/handler";
import { revokeInvitation } from "@/server/services/auth-service";

export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await revokeInvitation(ctx, params.id!);
  return { ok: true };
});
