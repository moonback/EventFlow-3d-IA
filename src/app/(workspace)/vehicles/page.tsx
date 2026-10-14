import { CalendarDays, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { vehicleOpsStatusLabels, vehicleOpsStatusTones, vehicleTypeLabels, type VehicleOpsStatus } from "@/lib/labels";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listVehicles } from "@/server/services/vehicle-service";

export const metadata = { title: "Véhicules" };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("vehicles:read");
  const sp = await searchParams;
  const query = parseListParams(sp);
  const ops = firstParam(sp.ops) as VehicleOpsStatus | undefined;
  const data = await listVehicles(ctx, { ...query, ops: ops && ops in vehicleOpsStatusLabels ? ops : undefined });
  return (
    <>
      <PageHeader
        title="Parc de véhicules"
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link href="/planning?view=vehicles">
                <CalendarDays /> Planning
              </Link>
            </Button>
            {can(ctx, "vehicles:write") ? (
              <Button size="sm" asChild>
                <Link href="/vehicles/new">
                  <Plus /> Véhicule
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <ListToolbar placeholder="Immatriculation, marque…" filters={[{ name: "ops", label: "Tous les statuts", options: Object.entries(vehicleOpsStatusLabels).map(([value, label]) => ({ value, label })) }]} />
      {data.items.length === 0 ? (
        <EmptyState icon={Truck} title="Aucun véhicule" />
      ) : (
        <>
          <DataTable
            caption="Véhicules"
            columns={[
              { id: "reg", header: "Immatriculation" },
              { id: "model", header: "Modèle" },
              { id: "type", header: "Type", hideOnMobile: true },
              { id: "capacity", header: "Capacité", hideOnMobile: true },
              { id: "km", header: "Km", align: "right", hideOnMobile: true },
              { id: "next", header: "Prochaine mission", hideOnMobile: true },
              { id: "alerts", header: "Alertes" },
              { id: "ops", header: "Statut" },
            ]}
            rows={data.items.map((v) => ({
              id: v.id,
              href: `/vehicles/${v.id}`,
              cells: {
                reg: <span className="font-mono">{v.registration}</span>,
                model: `${v.brand} ${v.model}`,
                type: vehicleTypeLabels[v.type],
                capacity: [v.payloadKg ? `${v.payloadKg} kg` : null, v.volumeM3 ? `${v.volumeM3} m³` : null].filter(Boolean).join(" · ") || "—",
                km: v.mileageKm.toLocaleString("fr-FR"),
                next: v.nextAssignment ? formatDateTime(v.nextAssignment, ctx.organization.timezone) : "—",
                alerts: v.alerts.length ? <Badge tone={v.alerts.some((a) => a.level === "danger") ? "danger" : "warning"}>{v.alerts.length}</Badge> : "—",
                ops: <StatusBadge value={v.ops} labels={vehicleOpsStatusLabels} tones={vehicleOpsStatusTones} />,
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
