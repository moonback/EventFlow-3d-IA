import { PackageSearch, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { reservationStatusLabels, reservationStatusTones } from "@/lib/labels";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listReservations } from "@/server/services/reservation-service";

export const metadata = { title: "Réservations" };

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("reservations:read");
  const sp = await searchParams;
  const query = parseListParams(sp, { dir: "desc" });
  const status = firstParam(sp.status) as keyof typeof reservationStatusLabels | undefined;
  const data = await listReservations(ctx, { ...query, status: status && status in reservationStatusLabels ? status : undefined });
  return (
    <>
      <PageHeader
        title="Réservations de matériel"
        description="Brouillon et « en attente » ne bloquent pas le stock ; seules les réservations confirmées (et suivantes) le font."
        actions={
          can(ctx, "reservations:write") ? (
            <Button size="sm" asChild>
              <Link href="/reservations/new">
                <Plus /> Nouvelle réservation
              </Link>
            </Button>
          ) : null
        }
      />
      <ListToolbar placeholder="Référence ou événement…" filters={[{ name: "status", label: "Tous les statuts", options: Object.entries(reservationStatusLabels).map(([value, label]) => ({ value, label })) }]} />
      {data.items.length === 0 ? (
        <EmptyState icon={PackageSearch} title="Aucune réservation" />
      ) : (
        <>
          <DataTable
            caption="Réservations"
            columns={[
              { id: "reference", header: "Référence" },
              { id: "event", header: "Événement" },
              { id: "period", header: "Période", hideOnMobile: true },
              { id: "lines", header: "Réf.", align: "right", hideOnMobile: true },
              { id: "progress", header: "Préparé", align: "right", hideOnMobile: true },
              { id: "status", header: "Statut" },
            ]}
            rows={data.items.map((r) => ({
              id: r.id,
              href: `/reservations/${r.id}`,
              cells: {
                reference: r.reference,
                event: (
                  <span>
                    {r.event.name}
                    <span className="block text-xs text-muted-foreground">{r.event.reference}</span>
                  </span>
                ),
                period: (
                  <span className="text-xs">
                    {formatDateTime(r.startAt, r.event.timezone)} → {formatDateTime(r.endAt, r.event.timezone)}
                  </span>
                ),
                lines: r.lineCount,
                progress: `${r.preparedQuantity}/${r.totalQuantity}`,
                status: <StatusBadge value={r.status} labels={reservationStatusLabels} tones={reservationStatusTones} />,
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
