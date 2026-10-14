import { CalendarDays, Download, PartyPopper, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { EVENT_STATUSES } from "@/features/events/schemas";
import { formatDateTime } from "@/lib/dates";
import { eventStatusLabels, eventStatusTones } from "@/lib/labels";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listEvents, listEventTypes } from "@/server/services/event-service";

export const metadata = { title: "Événements" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("events:read");
  const sp = await searchParams;
  const query = parseListParams(sp, { sort: "startAt", dir: "desc" });
  const status = firstParam(sp.status) as (typeof EVENT_STATUSES)[number] | undefined;
  const period = firstParam(sp.period);
  const now = new Date();
  const [data, types] = await Promise.all([
    listEvents(ctx, {
      ...query,
      status: status && EVENT_STATUSES.includes(status) ? status : undefined,
      eventTypeId: firstParam(sp.eventTypeId),
      ...(period === "upcoming" ? { from: now } : period === "past" ? { to: now } : {}),
    }),
    listEventTypes(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Événements"
        description="Dossiers événementiels : dates, lieu, matériel, équipes, véhicules et budget"
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/planning">
                <CalendarDays /> Calendrier
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/events/tasks">Tâches</Link>
            </Button>
            {can(ctx, "reports:export") ? (
              <Button variant="outline" size="sm" asChild>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- téléchargement de fichier, pas une navigation */}
                <a href="/api/exports/events">
                  <Download /> CSV
                </a>
              </Button>
            ) : null}
            {can(ctx, "events:write") ? (
              <Button size="sm" asChild>
                <Link href="/events/new">
                  <Plus /> Nouvel événement
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <ListToolbar
        placeholder="Nom, référence, ville, client…"
        filters={[
          { name: "status", label: "Tous les statuts", options: EVENT_STATUSES.map((s) => ({ value: s, label: eventStatusLabels[s] })) },
          { name: "eventTypeId", label: "Tous les types", options: types.map((t) => ({ value: t.id, label: t.name })) },
          { name: "period", label: "Toutes les dates", options: [{ value: "upcoming", label: "À venir / en cours" }, { value: "past", label: "Passés" }] },
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState icon={PartyPopper} title="Aucun événement" description="Créez un événement ou modifiez vos filtres." />
      ) : (
        <>
          <DataTable
            caption="Liste des événements"
            sort={query.sort}
            dir={query.dir}
            columns={[
              { id: "reference", header: "Référence", sortable: true },
              { id: "name", header: "Événement", sortable: true },
              { id: "customer", header: "Client", hideOnMobile: true },
              { id: "startAt", header: "Début", sortable: true },
              { id: "place", header: "Lieu", hideOnMobile: true },
              { id: "type", header: "Type", hideOnMobile: true },
              { id: "status", header: "Statut", sortable: true },
            ]}
            rows={data.items.map((e) => ({
              id: e.id,
              href: `/events/${e.id}`,
              cells: {
                reference: e.reference,
                name: e.name,
                customer: e.customer.name,
                startAt: formatDateTime(e.startAt, e.timezone),
                place: [e.venueName, e.city].filter(Boolean).join(", ") || "—",
                type: e.eventType ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: e.eventType.color }} aria-hidden />
                    {e.eventType.name}
                  </span>
                ) : (
                  "—"
                ),
                status: <StatusBadge value={e.status} labels={eventStatusLabels} tones={eventStatusTones} />,
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
