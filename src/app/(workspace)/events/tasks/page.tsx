import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Badge } from "@/components/ui/badge";
import { AddTaskDialog } from "@/features/events/components/event-dialogs";
import { TaskStatusSelect } from "@/features/events/components/task-status";
import { formatDateTime } from "@/lib/dates";
import { taskPriorityLabels, taskStatusLabels } from "@/lib/labels";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listTasks } from "@/server/services/event-service";
import { staffOptions } from "@/server/services/staff-service";

export const metadata = { title: "Tâches" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("events:read");
  const sp = await searchParams;
  const query = parseListParams(sp, { pageSize: 50 });
  const status = firstParam(sp.status) as keyof typeof taskStatusLabels | undefined;
  const data = await listTasks(ctx, { ...query, status: status && status in taskStatusLabels ? status : undefined, overdue: firstParam(sp.overdue) === "true", mine: firstParam(sp.mine) === "true" });
  const staff = can(ctx, "staff:read") ? await staffOptions(ctx) : [];
  const write = can(ctx, "tasks:write");
  return (
    <>
      <PageHeader title="Tâches" description="Suivi des actions, rattachées ou non à un événement" breadcrumbs={[{ label: "Événements", href: "/events" }, { label: "Tâches" }]} actions={write ? <AddTaskDialog staff={staff} /> : null} />
      <ListToolbar
        placeholder="Rechercher une tâche…"
        filters={[
          { name: "status", label: "Tous les statuts", options: Object.entries(taskStatusLabels).map(([value, label]) => ({ value, label })) },
          { name: "overdue", label: "Toutes échéances", options: [{ value: "true", label: "En retard uniquement" }] },
          { name: "mine", label: "Toutes les personnes", options: [{ value: "true", label: "Mes tâches" }] },
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Aucune tâche" />
      ) : (
        <>
          <DataTable
            caption="Tâches"
            columns={[
              { id: "title", header: "Tâche" },
              { id: "event", header: "Événement", hideOnMobile: true },
              { id: "assignee", header: "Responsable", hideOnMobile: true },
              { id: "priority", header: "Priorité" },
              { id: "due", header: "Échéance" },
              { id: "status", header: "Statut" },
            ]}
            rows={data.items.map((t) => ({
              id: t.id,
              className: t.overdue ? "bg-destructive/5" : undefined,
              cells: {
                title: <span className="font-medium">{t.title}</span>,
                event: t.event ? (
                  <Link href={`/events/${t.event.id}`} className="hover:underline">
                    {t.event.reference}
                  </Link>
                ) : (
                  "—"
                ),
                assignee: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "—",
                priority: <Badge tone={t.priority === "URGENT" ? "danger" : t.priority === "HIGH" ? "warning" : "neutral"}>{taskPriorityLabels[t.priority]}</Badge>,
                due: t.dueAt ? <span className={t.overdue ? "text-destructive" : undefined}>{formatDateTime(t.dueAt, ctx.organization.timezone)}</span> : "—",
                status: <TaskStatusSelect taskId={t.id} status={t.status} disabled={!write} />,
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
