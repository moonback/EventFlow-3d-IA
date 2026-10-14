import { apiHandler } from "@/server/api/handler";
import { deleteDocument } from "@/server/services/document-service";

export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await deleteDocument(ctx, params.id!);
  return { ok: true };
});
