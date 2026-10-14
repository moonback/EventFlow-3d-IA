import { Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { purchaseOrderStatusLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listPurchaseOrders } from "@/server/services/purchase-service";

export const metadata = { title: "Achats" };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("purchases:read");
  const sp = await searchParams;
  const query = parseListParams(sp);
  const status = firstParam(sp.status) as keyof typeof purchaseOrderStatusLabels | undefined;
  const data = await listPurchaseOrders(ctx, { ...query, status: status && status in purchaseOrderStatusLabels ? status : undefined });
  const tz = ctx.organization.timezone;
  return (
    <>
      <PageHeader
        title="Commandes fournisseurs"
        description="Le stock n'augmente qu'à la réception effective des marchandises."
        actions={
          can(ctx, "purchases:write") ? (
            <Button size="sm" asChild>
              <Link href="/purchases/new">
                <Plus /> Commande
              </Link>
            </Button>
          ) : null
        }
      />
      <ListToolbar placeholder="Numéro ou fournisseur…" filters={[{ name: "status", label: "Tous les statuts", options: Object.entries(purchaseOrderStatusLabels).map(([value, label]) => ({ value, label })) }]} />
      {data.items.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Aucune commande" />
      ) : (
        <>
          <DataTable
            caption="Commandes fournisseurs"
            columns={[
              { id: "number", header: "Numéro" },
              { id: "supplier", header: "Fournisseur" },
              { id: "ordered", header: "Commandée le", hideOnMobile: true },
              { id: "expected", header: "Attendue le", hideOnMobile: true },
              { id: "total", header: "Total HT", align: "right" },
              { id: "status", header: "Statut" },
            ]}
            rows={data.items.map((p) => ({
              id: p.id,
              href: `/purchases/${p.id}`,
              cells: {
                number: p.number,
                supplier: p.supplier.name,
                ordered: formatDate(p.orderedAt, tz),
                expected: formatDate(p.expectedAt, tz),
                total: formatMoney(p.totalExclTax),
                status: <Badge tone={p.status === "RECEIVED" ? "success" : p.status === "ORDERED" ? "info" : p.status === "PARTIALLY_RECEIVED" ? "warning" : "neutral"}>{purchaseOrderStatusLabels[p.status]}</Badge>,
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
