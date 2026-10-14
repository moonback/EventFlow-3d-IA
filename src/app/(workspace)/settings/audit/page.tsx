import { History } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { formatDateTime } from "@/lib/dates";
import { firstParam, parseListParams } from "@/lib/pagination";
import { pageContext } from "@/server/auth/page";
import { listAuditLog } from "@/server/services/settings-service";

export const metadata = { title: "Journal d'audit" };

const ENTITIES = ["Customer", "Event", "Reservation", "StockMovement", "Invoice", "Quote", "Membership", "RolePermission", "Organization", "Vehicle", "StaffMember", "Document", "User"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("audit:read");
  const sp = await searchParams;
  const query = parseListParams(sp, { pageSize: 50 });
  const data = await listAuditLog(ctx, { ...query, entityType: firstParam(sp.entityType) });
  return (
    <>
      <PageHeader title="Journal d'audit" description="Connexions, changements de rôle, opérations de stock, émissions de factures, paiements… Les journaux ne contiennent ni mots de passe ni secrets." breadcrumbs={[{ label: "Paramètres", href: "/settings" }, { label: "Audit" }]} />
      <ListToolbar placeholder="Action (ex. invoice.issued)…" filters={[{ name: "entityType", label: "Toutes les entités", options: ENTITIES.map((e) => ({ value: e, label: e })) }]} />
      {data.items.length === 0 ? (
        <EmptyState icon={History} title="Aucune entrée" />
      ) : (
        <>
          <DataTable
            caption="Journal d'audit"
            columns={[
              { id: "date", header: "Date" },
              { id: "actor", header: "Utilisateur" },
              { id: "action", header: "Action" },
              { id: "entity", header: "Entité", hideOnMobile: true },
              { id: "changes", header: "Détails", hideOnMobile: true },
              { id: "ip", header: "IP", hideOnMobile: true },
            ]}
            rows={data.items.map((a) => ({
              id: a.id,
              cells: {
                date: <span className="whitespace-nowrap">{formatDateTime(a.createdAt, ctx.organization.timezone)}</span>,
                actor: a.actor?.name ?? "Système",
                action: <span className="font-mono text-xs">{a.action}</span>,
                entity: (
                  <span className="text-xs">
                    {a.entityType} <span className="font-mono text-muted-foreground">{a.entityId?.slice(-8)}</span>
                  </span>
                ),
                changes: (
                  <span className="block max-w-md truncate text-xs text-muted-foreground">
                    {a.changes ? Object.entries(a.changes).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ") : "—"}
                  </span>
                ),
                ip: <span className="font-mono text-xs">{a.ipAddress ?? "—"}</span>,
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
