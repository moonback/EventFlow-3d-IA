import { Wrench } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { formatDate } from "@/lib/dates";
import { maintenanceStatusLabels, maintenanceStatusTones } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { locationOptions } from "@/server/services/inventory-service";
import { listMaintenance } from "@/server/services/maintenance-service";
import { ResolveDialog } from "./resolve-dialog";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("stock:read");
  const sp = await searchParams;
  const query = parseListParams(sp);
  const status = firstParam(sp.status) as keyof typeof maintenanceStatusLabels | undefined;
  const openOnly = !status && firstParam(sp.all) !== "true";
  const [data, storage] = await Promise.all([
    listMaintenance(ctx, { ...query, status: status && status in maintenanceStatusLabels ? status : undefined, open: openOnly }),
    can(ctx, "maintenance:write") ? locationOptions(ctx, ["WAREHOUSE", "ZONE", "RACK", "BIN"]) : Promise.resolve([]),
  ]);
  const write = can(ctx, "maintenance:write");
  return (
    <>
      <PageHeader title="Maintenance du matériel" description="Le matériel endommagé ou en atelier est exclu de la disponibilité jusqu'à sa remise en état validée." />
      <ListToolbar
        placeholder="Référence, produit…"
        filters={[
          { name: "status", label: "Tickets ouverts", options: Object.entries(maintenanceStatusLabels).map(([value, label]) => ({ value, label })) },
          { name: "all", label: "Ouverts uniquement", options: [{ value: "true", label: "Tous les tickets" }] },
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState icon={Wrench} title="Aucun ticket de maintenance" />
      ) : (
        <>
          <DataTable
            caption="Tickets de maintenance"
            columns={[
              { id: "ref", header: "Ticket" },
              { id: "product", header: "Matériel" },
              { id: "issue", header: "Problème", hideOnMobile: true },
              { id: "qty", header: "Qté (quar./atelier/réparé/rebut)", align: "right" },
              { id: "cost", header: "Coût", align: "right", hideOnMobile: true },
              { id: "date", header: "Ouvert le", hideOnMobile: true },
              { id: "status", header: "Statut" },
              { id: "actions", header: "" },
            ]}
            rows={data.items.map((t) => ({
              id: t.id,
              cells: {
                ref: <span className="font-medium">{t.reference}</span>,
                product: (
                  <Link href={`/inventory/${t.product.id}`} className="hover:underline">
                    {t.product.name}
                  </Link>
                ),
                issue: (
                  <span>
                    {t.title}
                    {t.description ? <span className="block max-w-xs truncate text-xs text-muted-foreground">{t.description}</span> : null}
                  </span>
                ),
                qty: (
                  <span className="tabular-nums">
                    {t.inQuarantine} / {t.quantityInRepair} / {t.quantityRepaired} / {t.quantityScrapped}
                  </span>
                ),
                cost: formatMoney(t.cost),
                date: formatDate(t.createdAt, ctx.organization.timezone),
                status: <StatusBadge value={t.status} labels={maintenanceStatusLabels} tones={maintenanceStatusTones} />,
                actions:
                  write && (t.status === "OPEN" || t.status === "IN_PROGRESS") ? (
                    <span className="flex justify-end gap-1">
                      {t.inQuarantine > 0 ? (
                        <ActionButton url={`/api/maintenance/${t.id}/start`} size="sm" variant="outline" successMessage="Matériel passé en atelier">
                          En atelier
                        </ActionButton>
                      ) : null}
                      <ResolveDialog ticketId={t.id} reference={t.reference} remaining={t.quantity - t.quantityRepaired - t.quantityScrapped} storage={storage} />
                    </span>
                  ) : null,
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
