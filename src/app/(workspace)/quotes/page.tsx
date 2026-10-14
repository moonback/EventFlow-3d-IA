import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { quoteStatusLabels, quoteStatusTones } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listQuotes } from "@/server/services/quote-service";

export const metadata = { title: "Devis" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("quotes:read");
  const sp = await searchParams;
  const query = parseListParams(sp, { dir: "desc" });
  const status = firstParam(sp.status) as keyof typeof quoteStatusLabels | undefined;
  const data = await listQuotes(ctx, { ...query, status: status && status in quoteStatusLabels ? status : undefined, followUp: firstParam(sp.followUp) === "true" });
  const tz = ctx.organization.timezone;
  return (
    <>
      <PageHeader
        title="Devis"
        description="Numérotation unique, versions, envoi sur action explicite et suivi des relances."
        actions={
          can(ctx, "quotes:write") ? (
            <Button size="sm" asChild>
              <Link href="/quotes/new">
                <Plus /> Nouveau devis
              </Link>
            </Button>
          ) : null
        }
      />
      <ListToolbar
        placeholder="Numéro, objet, client…"
        filters={[
          { name: "status", label: "Tous les statuts", options: Object.entries(quoteStatusLabels).map(([value, label]) => ({ value, label })) },
          { name: "followUp", label: "Toutes relances", options: [{ value: "true", label: "À relancer" }] },
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun devis" />
      ) : (
        <>
          <DataTable
            caption="Devis"
            columns={[
              { id: "number", header: "Numéro" },
              { id: "title", header: "Objet" },
              { id: "customer", header: "Client", hideOnMobile: true },
              { id: "issue", header: "Émis le", hideOnMobile: true },
              { id: "valid", header: "Validité", hideOnMobile: true },
              { id: "ht", header: "Total HT", align: "right" },
              { id: "ttc", header: "Total TTC", align: "right", hideOnMobile: true },
              { id: "status", header: "Statut" },
            ]}
            rows={data.items.map((q) => ({
              id: q.id,
              href: `/quotes/${q.id}`,
              cells: {
                number: q.number,
                title: q.title,
                customer: q.customer.name,
                issue: formatDate(q.issueDate, tz),
                valid: <span className={q.isExpired ? "text-destructive" : undefined}>{formatDate(q.validUntil, tz)}</span>,
                ht: formatMoney(q.totalExclTax),
                ttc: formatMoney(q.totalInclTax),
                status: (
                  <span className="inline-flex items-center gap-1.5">
                    <StatusBadge value={q.status} labels={quoteStatusLabels} tones={quoteStatusTones} />
                    {q.needsFollowUp ? <Badge tone="warning">À relancer</Badge> : null}
                  </span>
                ),
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
