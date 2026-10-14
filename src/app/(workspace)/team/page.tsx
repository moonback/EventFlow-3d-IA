import { CalendarDays, Plus, Users } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkillDialog } from "@/features/staff/components/staff-dialogs";
import { formatDateTime } from "@/lib/dates";
import { employmentTypeLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listSkills, listStaff } from "@/server/services/staff-service";

export const metadata = { title: "Équipe" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("staff:read");
  const sp = await searchParams;
  const query = parseListParams(sp, { pageSize: 50 });
  const active = firstParam(sp.active);
  const [data, skills] = await Promise.all([listStaff(ctx, { ...query, active: active === "false" ? false : true, skillId: firstParam(sp.skillId) }), listSkills(ctx)]);
  const costs = can(ctx, "staff:costs");
  return (
    <>
      <PageHeader
        title="Équipe"
        description="Collaborateurs, intermittents et prestataires — compétences, disponibilités et affectations."
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link href="/planning?view=staff">
                <CalendarDays /> Planning
              </Link>
            </Button>
            {can(ctx, "staff:write") ? (
              <>
                <SkillDialog />
                <Button size="sm" asChild>
                  <Link href="/team/new">
                    <Plus /> Collaborateur
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <ListToolbar
        placeholder="Nom, poste…"
        filters={[
          { name: "skillId", label: "Toutes compétences", options: skills.map((s) => ({ value: s.id, label: s.name })) },
          { name: "active", label: "Actifs", options: [{ value: "false", label: "Inactifs" }] },
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState icon={Users} title="Aucun collaborateur" />
      ) : (
        <>
          <DataTable
            caption="Collaborateurs"
            columns={[
              { id: "name", header: "Nom" },
              { id: "job", header: "Poste", hideOnMobile: true },
              { id: "type", header: "Statut", hideOnMobile: true },
              { id: "skills", header: "Compétences", hideOnMobile: true },
              ...(costs ? [{ id: "cost", header: "Coût / h", align: "right" as const }] : []),
              { id: "next", header: "Prochaine mission" },
            ]}
            rows={data.items.map((s) => ({
              id: s.id,
              href: `/team/${s.id}`,
              cells: {
                name: s.name,
                job: s.jobTitle ?? "—",
                type: employmentTypeLabels[s.employmentType],
                skills: (
                  <span className="flex flex-wrap gap-1">
                    {s.skills.map((k) => (
                      <Badge key={k.id}>{k.name}</Badge>
                    ))}
                  </span>
                ),
                cost: formatMoney(s.hourlyCost),
                next: s.nextAssignment ? (
                  <span className="text-xs">
                    {s.nextAssignment.event.reference} · {formatDateTime(s.nextAssignment.startAt, ctx.organization.timezone)}
                  </span>
                ) : (
                  "—"
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
