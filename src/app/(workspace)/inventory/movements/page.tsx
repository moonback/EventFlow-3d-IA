import { Download, History } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReverseMovementButton } from "@/features/inventory/components/reverse-button";
import { formatDateTime } from "@/lib/dates";
import { movementTypeLabels } from "@/lib/labels";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listMovements } from "@/server/services/stock-movement-service";

export const metadata = { title: "Journal des mouvements" };

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("stock:read");
  const sp = await searchParams;
  const query = parseListParams(sp, { pageSize: 50, dir: "desc" });
  const type = firstParam(sp.type) as keyof typeof movementTypeLabels | undefined;
  const data = await listMovements(ctx, { ...query, type: type && type in movementTypeLabels ? type : undefined, productId: firstParam(sp.productId), locationId: firstParam(sp.locationId) });
  const tz = ctx.organization.timezone;
  return (
    <>
      <PageHeader
        title="Journal des mouvements"
        description="Traçabilité complète : le journal est en ajout seul, les corrections passent par des mouvements compensatoires."
        breadcrumbs={[{ label: "Catalogue", href: "/inventory" }, { label: "Mouvements" }]}
        actions={
          can(ctx, "reports:export") ? (
            <Button size="sm" variant="outline" asChild>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- téléchargement de fichier, pas une navigation */}
              <a href="/api/exports/movements">
                <Download /> Export CSV
              </a>
            </Button>
          ) : null
        }
      />
      <ListToolbar placeholder="Produit ou SKU…" filters={[{ name: "type", label: "Tous les types", options: Object.entries(movementTypeLabels).map(([value, label]) => ({ value, label })) }]} />
      {data.items.length === 0 ? (
        <EmptyState icon={History} title="Aucun mouvement" />
      ) : (
        <>
          <DataTable
            caption="Mouvements de stock"
            columns={[
              { id: "date", header: "Date" },
              { id: "type", header: "Type" },
              { id: "product", header: "Produit" },
              { id: "qty", header: "Qté", align: "right" },
              { id: "path", header: "De → Vers", hideOnMobile: true },
              { id: "reason", header: "Motif / référence", hideOnMobile: true },
              { id: "user", header: "Par", hideOnMobile: true },
              { id: "actions", header: "" },
            ]}
            rows={data.items.map((m) => ({
              id: m.id,
              cells: {
                date: <span className="whitespace-nowrap">{formatDateTime(m.occurredAt, tz)}</span>,
                type: (
                  <span className="inline-flex items-center gap-1.5">
                    {movementTypeLabels[m.type]}
                    {m.isReversed ? <Badge tone="warning">Compensé</Badge> : null}
                  </span>
                ),
                product: (
                  <Link href={`/inventory/${m.product.id}`} className="hover:underline">
                    {m.product.name} <span className="font-mono text-xs text-muted-foreground">{m.product.sku}</span>
                  </Link>
                ),
                qty: m.quantity,
                path: (
                  <span className="font-mono text-xs">
                    {m.fromLocation?.code ?? "—"} → {m.toLocation?.code ?? "—"}
                  </span>
                ),
                reason: (
                  <span className="text-muted-foreground">
                    {m.reservation ? (
                      <Link href={`/reservations/${m.reservation.id}`} className="hover:underline">
                        {m.reservation.reference}
                      </Link>
                    ) : null}{" "}
                    {m.reason}
                  </span>
                ),
                user: m.user?.name ?? "—",
                actions: m.reversible && can(ctx, "stock:write") ? <ReverseMovementButton movementId={m.id} label={`${movementTypeLabels[m.type]} ×${m.quantity} ${m.product.sku}`} /> : null,
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
