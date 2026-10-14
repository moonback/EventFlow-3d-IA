import { Inbox, Link2 } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { OPPORTUNITY_STAGES } from "@/features/opportunities/schemas";
import { formatDate } from "@/lib/dates";
import { opportunitySourceLabels, opportunityStageLabels, opportunityStageTones } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listOpportunities } from "@/server/services/opportunity-service";

export const metadata = { title: "Demandes" };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("quotes:read");
  const sp = await searchParams;
  const query = parseListParams(sp);
  const stageParam = firstParam(sp.stage);
  const stage = OPPORTUNITY_STAGES.find((s) => s === stageParam);
  const data = await listOpportunities(ctx, { ...query, stage });
  const currency = ctx.organization.currency;
  return (
    <>
      <PageHeader
        title="Demandes"
        description={OPPORTUNITY_STAGES.map((s) => `${opportunityStageLabels[s]} : ${data.counts[s] ?? 0}`).join(" · ")}
        actions={
          can(ctx, "settings:manage") ? (
            <Button size="sm" variant="outline" asChild>
              <Link href="/settings/organization#formulaire-public">
                <Link2 /> Formulaire public
              </Link>
            </Button>
          ) : null
        }
      />
      <ListToolbar
        placeholder="Référence, contact, société…"
        filters={[{ name: "stage", label: "Toutes les étapes", options: OPPORTUNITY_STAGES.map((s) => ({ value: s, label: opportunityStageLabels[s] })) }]}
      />
      {data.items.length === 0 ? (
        <EmptyState icon={Inbox} title="Aucune demande" description="Les demandes envoyées depuis votre formulaire public apparaîtront ici." />
      ) : (
        <>
          <DataTable
            caption="Demandes commerciales"
            columns={[
              { id: "reference", header: "Référence" },
              { id: "title", header: "Demande" },
              { id: "eventDate", header: "Date", hideOnMobile: true },
              { id: "guests", header: "Invités", align: "right", hideOnMobile: true },
              { id: "budget", header: "Budget", align: "right", hideOnMobile: true },
              { id: "source", header: "Origine", hideOnMobile: true },
              { id: "stage", header: "Étape" },
            ]}
            rows={data.items.map((o) => ({
              id: o.id,
              href: `/opportunities/${o.id}`,
              cells: {
                reference: o.reference,
                title: o.title,
                eventDate: o.eventDate ? formatDate(o.eventDate, "UTC") : "—",
                guests: o.guestCount ?? "—",
                budget: o.budget ? formatMoney(o.budget, currency) : "—",
                source: opportunitySourceLabels[o.source],
                stage: <StatusBadge value={o.stage} labels={opportunityStageLabels} tones={opportunityStageTones} />,
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
