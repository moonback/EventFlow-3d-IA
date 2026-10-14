import { apiHandler } from "@/server/api/handler";
import { deleteExpense } from "@/server/services/invoice-service";

export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await deleteExpense(ctx, params.id!);
  return { ok: true };
});
