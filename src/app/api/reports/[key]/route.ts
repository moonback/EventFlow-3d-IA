import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { assertCan } from "@/server/auth/context";
import { apiHandler } from "@/server/api/handler";
import { fileResponse } from "@/server/api/responses";
import { isReportKey, runReport, toCsv } from "@/server/services/report-service";

const query = z.object({ from: z.coerce.date(), to: z.coerce.date(), format: z.enum(["json", "csv"]).default("json") });

/** GET /api/reports/:key?from&to[&format=csv] — l'export CSV exige reports:export. */
export const GET = apiHandler({ query }, async ({ ctx, params, query }) => {
  if (!isReportKey(params.key!)) throw new NotFoundError("Rapport");
  const report = await runReport(ctx, params.key, query.from, query.to);
  if (query.format === "csv") {
    assertCan(ctx, "reports:export");
    return fileResponse(toCsv(report.columns, report.rows), "text/csv; charset=utf-8", `rapport-${report.key}-${query.from.toISOString().slice(0, 10)}.csv`);
  }
  return report;
});
