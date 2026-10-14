import { apiHandler } from "@/server/api/handler";
import { fileResponse } from "@/server/api/responses";
import { renderQuotePdf } from "@/server/pdf/documents";
import { getQuote } from "@/server/services/quote-service";

export const GET = apiHandler({}, async ({ ctx, params, req }) => {
  const q = await getQuote(ctx, params.id!);
  const pdf = await renderQuotePdf(ctx, params.id!);
  return fileResponse(pdf, "application/pdf", `devis-${q.number}.pdf`, req.nextUrl.searchParams.get("inline") === "1");
});
