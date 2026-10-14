import { invoiceSchema } from "@/features/invoices/schemas";
import { apiHandler } from "@/server/api/handler";
import { deleteInvoiceDraft, getInvoice, updateInvoiceDraft } from "@/server/services/invoice-service";

export const GET = apiHandler({}, ({ ctx, params }) => getInvoice(ctx, params.id!));
export const PUT = apiHandler({ body: invoiceSchema }, ({ ctx, params, body }) => updateInvoiceDraft(ctx, params.id!, body));
export const DELETE = apiHandler({}, async ({ ctx, params }) => {
  await deleteInvoiceDraft(ctx, params.id!);
  return { ok: true };
});
