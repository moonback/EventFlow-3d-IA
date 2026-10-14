import { changePasswordSchema } from "@/features/auth/schemas";
import { apiHandler } from "@/server/api/handler";
import { changePassword } from "@/server/services/auth-service";

export const POST = apiHandler({ body: changePasswordSchema }, async ({ ctx, body }) => {
  await changePassword(ctx, body.currentPassword, body.password);
  return { ok: true };
});
