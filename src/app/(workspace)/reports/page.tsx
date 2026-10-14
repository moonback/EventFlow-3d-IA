import { BarChart3, Download } from "lucide-react";
import Link from "next/link";
import { SimpleBarChart } from "@/components/charts/charts";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { firstParam } from "@/lib/pagination";
import { isDay, localDayToUtc, periodPresets } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { availableReports, isReportKey, runReport, type ReportColumn } from "@/server/services/report-service";
import { PeriodPicker } from "../finance/period-picker";

export const metadata = { title: "Rapports" };

const CHARTS: Record<string, { key: string; label: string; format: "number" | "money" | "percent" }> = {
  profitability: { key: "marginActual", label: "Marge réelle", format: "money" },
  utilization: { key: "rate", label: "Taux d'occupation", format: "percent" },
  workload: { key: "plannedHours", label: "Heures prévues", format: "number" },
  logistics: { key: "fleetCost", label: "Coût flotte", format: "money" },
};

function cell(col: ReportColumn, v: string | number | null, tz: string) {
  if (v === null || v === undefined || v === "") return "—";
  if (col.type === "money") return formatMoney(String(v));
  if (col.type === "percent") return `${v} %`;
  if (col.type === "date") return formatDate(String(v), tz);
  return String(v);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("reports:read");
  const sp = await searchParams;
  const tz = ctx.organization.timezone;
  const reports = availableReports(ctx);
  const presets = periodPresets(tz);
  const fromDay = isDay(firstParam(sp.from)) ? firstParam(sp.from)! : presets[3]!.from;
  const toDay = isDay(firstParam(sp.to)) ? firstParam(sp.to)! : presets[3]!.to;
  const key = firstParam(sp.report) ?? reports[0]?.key;
  const from = localDayToUtc(fromDay, tz);
  const to = localDayToUtc(toDay, tz);
  const report = key && isReportKey(key) && reports.some((r) => r.key === key) ? await runReport(ctx, key, from, to) : null;
  const chart = report ? CHARTS[report.key] : undefined;
  return (
    <>
      <PageHeader title="Rapports" description="Rapports filtrables calculés sur les données réelles ; exports CSV selon vos droits." />
      {reports.length === 0 ? (
        <EmptyState icon={BarChart3} title="Aucun rapport accessible avec votre rôle" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <nav aria-label="Rapports" className="flex flex-col gap-1">
            {reports.map((r) => (
              <Link
                key={r.key}
                href={`/reports?report=${r.key}&from=${fromDay}&to=${toDay}`}
                className={cn("rounded-lg px-3 py-2 text-sm hover:bg-accent", r.key === key && "bg-accent font-medium")}
                aria-current={r.key === key ? "page" : undefined}
              >
                {r.title}
                <span className="block text-xs font-normal text-muted-foreground">{r.description}</span>
              </Link>
            ))}
          </nav>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <PeriodPicker from={fromDay} to={toDay} presets={presets} />
              {report && can(ctx, "reports:export") ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/reports/${report.key}?from=${from.toISOString()}&to=${to.toISOString()}&format=csv`}>
                    <Download /> Export CSV
                  </a>
                </Button>
              ) : null}
            </div>
            {report ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold">{report.title}</h2>
                  <p className="text-sm text-muted-foreground">{report.description}</p>
                </div>
                {chart && report.rows.length ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{chart.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SimpleBarChart
                        label={chart.label}
                        dataKey="value"
                        valueFormat={chart.format}
                        data={report.rows
                          .slice(0, 12)
                          .map((r) => ({ name: String(r.name ?? r.reference ?? r.sku ?? ""), value: Number(r[chart.key] ?? 0) }))}
                      />
                    </CardContent>
                  </Card>
                ) : null}
                {report.rows.length === 0 ? (
                  <EmptyState title="Aucune donnée sur la période" />
                ) : (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {report.columns.map((c) => (
                            <TableHead key={c.key} className={c.type && c.type !== "text" && c.type !== "date" ? "text-right" : undefined}>
                              {c.label}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.rows.map((r, i) => (
                          <TableRow key={i}>
                            {report.columns.map((c) => (
                              <TableCell key={c.key} className={c.type && c.type !== "text" && c.type !== "date" ? "text-right tabular-nums" : undefined}>
                                {cell(c, r[c.key] ?? null, tz)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
