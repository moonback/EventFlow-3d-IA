import { apiHandler } from "@/server/api/handler";
import { deleteContact } from "@/server/services/customer-service";

export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await deleteContact(ctx, params.id!, params.contactId!);
  return { ok: true };
});
