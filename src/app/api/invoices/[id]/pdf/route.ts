import { apiHandler } from "@/server/api/handler";
import { fileResponse } from "@/server/api/responses";
import { renderInvoicePdf } from "@/server/pdf/documents";
import { getInvoice } from "@/server/services/invoice-service";

export const GET = apiHandler({}, async ({ ctx, params, req }) => {
  const i = await getInvoice(ctx, params.id!);
  const pdf = await renderInvoicePdf(ctx, params.id!);
  const prefix = i.kind === "CREDIT_NOTE" ? "avoir" : "facture";
  return fileResponse(pdf, "application/pdf", `${prefix}-${i.number ?? "brouillon"}.pdf`, req.nextUrl.searchParams.get("inline") === "1");
});
