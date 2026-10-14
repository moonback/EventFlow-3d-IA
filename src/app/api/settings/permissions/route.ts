import { rolePermissionSchema } from "@/features/settings/schemas";
import { apiHandler } from "@/server/api/handler";
import { getPermissionMatrix, setRolePermission } from "@/server/services/settings-service";

export const GET = apiHandler({}, ({ ctx }) => getPermissionMatrix(ctx));
export const PUT = apiHandler({ body: rolePermissionSchema }, async ({ ctx, body }) => {
  await setRolePermission(ctx, body.role, body.permission, body.granted);
  return { ok: true };
});
