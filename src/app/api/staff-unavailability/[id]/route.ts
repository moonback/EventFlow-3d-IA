import { apiHandler } from "@/server/api/handler";
import { deleteUnavailability } from "@/server/services/staff-service";

export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await deleteUnavailability(ctx, params.id!);
  return { ok: true };
});
