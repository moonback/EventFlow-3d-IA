import { NotFoundError } from "@/lib/errors";
import { apiHandler } from "@/server/api/handler";
import { fileResponse } from "@/server/api/responses";
import { renderStockReportPdf } from "@/server/pdf/documents";
import { exportDataset } from "@/server/services/import-service";

const DATASETS = ["products", "customers", "events", "movements"] as const;

export const GET = apiHandler({}, async ({ ctx, params, req }) => {
  const dataset = params.dataset!;
  const date = new Date().toISOString().slice(0, 10);
  if (dataset === "stock-pdf") {
    const pdf = await renderStockReportPdf(ctx);
    return fileResponse(pdf, "application/pdf", `rapport-stock-${date}.pdf`, req.nextUrl.searchParams.get("inline") === "1");
  }
  if (!(DATASETS as readonly string[]).includes(dataset)) throw new NotFoundError("Export");
  const csv = await exportDataset(ctx, dataset as (typeof DATASETS)[number]);
  return fileResponse(csv, "text/csv; charset=utf-8", `${dataset}-${date}.csv`);
});
