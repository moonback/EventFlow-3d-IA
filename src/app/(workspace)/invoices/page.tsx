import { Plus, Receipt } from "lucide-react";
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
import { invoiceStatusLabels, invoiceStatusTones } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listInvoices } from "@/server/services/invoice-service";

export const metadata = { title: "Factures" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("invoices:read");
  const sp = await searchParams;
  const query = parseListParams(sp);
  const status = firstParam(sp.status) as keyof typeof invoiceStatusLabels | undefined;
  const kind = firstParam(sp.kind);
  const data = await listInvoices(ctx, { ...query, status: status && status in invoiceStatusLabels ? status : undefined, overdue: firstParam(sp.overdue) === "true", kind: kind === "INVOICE" || kind === "CREDIT_NOTE" ? kind : undefined });
  const tz = ctx.organization.timezone;
  return (
    <>
      <PageHeader
        title="Factures & avoirs"
        description="Numérotation séquentielle à l'émission ; une facture émise n'est plus modifiable (correction par avoir)."
        actions={
          can(ctx, "invoices:write") ? (
            <Button size="sm" asChild>
              <Link href="/invoices/new">
                <Plus /> Nouvelle facture
              </Link>
            </Button>
          ) : null
        }
      />
      <ListToolbar
        placeholder="Numéro, objet, client…"
        filters={[
          { name: "status", label: "Tous les statuts", options: Object.entries(invoiceStatusLabels).map(([value, label]) => ({ value, label })) },
          { name: "kind", label: "Factures et avoirs", options: [{ value: "INVOICE", label: "Factures" }, { value: "CREDIT_NOTE", label: "Avoirs" }] },
          { name: "overdue", label: "Toutes échéances", options: [{ value: "true", label: "En retard de paiement" }] },
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState icon={Receipt} title="Aucune facture" />
      ) : (
        <>
          <DataTable
            caption="Factures"
            columns={[
              { id: "number", header: "Numéro" },
              { id: "title", header: "Objet" },
              { id: "customer", header: "Client", hideOnMobile: true },
              { id: "issue", header: "Émise le", hideOnMobile: true },
              { id: "due", header: "Échéance" },
              { id: "ttc", header: "Total TTC", align: "right" },
              { id: "balance", header: "Reste dû", align: "right" },
              { id: "status", header: "Statut" },
            ]}
            rows={data.items.map((i) => ({
              id: i.id,
              href: `/invoices/${i.id}`,
              cells: {
                number: (
                  <span className="inline-flex items-center gap-1.5">
                    {i.number ?? "Brouillon"} {i.kind === "CREDIT_NOTE" ? <Badge tone="accent">Avoir</Badge> : null}
                  </span>
                ),
                title: i.title,
                customer: i.customer.name,
                issue: formatDate(i.issueDate, tz),
                due: i.overdue ? <span className="text-destructive">{formatDate(i.dueDate, tz)} · {i.daysLate} j</span> : formatDate(i.dueDate, tz),
                ttc: formatMoney(i.totalInclTax),
                balance: Number(i.balanceDue) > 0 ? <span className="font-medium">{formatMoney(i.balanceDue)}</span> : "—",
                status: <StatusBadge value={i.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />,
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
