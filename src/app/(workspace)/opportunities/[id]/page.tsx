import { FileText, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpportunityForm } from "@/features/opportunities/components/opportunity-form";
import { formatDate, formatDateTime } from "@/lib/dates";
import { opportunitySourceLabels, opportunityStageLabels, opportunityStageTones } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getOpportunity } from "@/server/services/opportunity-service";
import { memberUserOptions } from "@/server/services/settings-service";

export const metadata = { title: "Demande" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("quotes:read");
  const { id } = await params;
  const o = await loadOr404(() => getOpportunity(ctx, id));
  const write = can(ctx, "quotes:write");
  const members = write ? await memberUserOptions(ctx) : [];
  const { currency, timezone } = ctx.organization;
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {o.title} <StatusBadge value={o.stage} labels={opportunityStageLabels} tones={opportunityStageTones} />
          </span>
        }
        description={`${o.reference} · ${opportunitySourceLabels[o.source]} · reçue le ${formatDateTime(o.createdAt, timezone)}`}
        breadcrumbs={[{ label: "Demandes", href: "/opportunities" }, { label: o.reference }]}
        actions={
          write && o.customer ? (
            <Button size="sm" asChild>
              <Link href={`/quotes/new?customerId=${o.customer.id}`}>
                <FileText /> Créer un devis
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="font-medium">{o.contactName}</p>
            {o.companyName ? <p className="text-muted-foreground">{o.companyName}</p> : null}
            <a href={`mailto:${o.contactEmail}`} className="flex items-center gap-2 hover:underline">
              <Mail className="size-4" aria-hidden /> {o.contactEmail}
            </a>
            {o.contactPhone ? (
              <a href={`tel:${o.contactPhone}`} className="flex items-center gap-2 hover:underline">
                <Phone className="size-4" aria-hidden /> {o.contactPhone}
              </a>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {o.customer ? (
                <>
                  Client existant :{" "}
                  <Link href={`/customers/${o.customer.id}`} className="text-foreground underline">
                    {o.customer.name}
                  </Link>
                </>
              ) : (
                "Aucun client existant avec cet e-mail."
              )}
            </p>
            {!o.customer && can(ctx, "customers:write") ? (
              <Button size="sm" variant="outline" asChild>
                <Link href="/customers/new">Créer la fiche client</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Événement souhaité</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <dl>
              <Row label="Type">{o.eventType?.name ?? "—"}</Row>
              <Row label="Date">{o.eventDate ? formatDate(o.eventDate, "UTC") : "—"}</Row>
              <Row label="Lieu">{o.venue ?? "—"}</Row>
              <Row label="Invités">{o.guestCount ?? "—"}</Row>
              <Row label="Budget indiqué">{o.budget ? formatMoney(o.budget, currency) : "—"}</Row>
            </dl>
            {o.message ? <p className="mt-3 whitespace-pre-line rounded-lg bg-muted p-3 text-muted-foreground">{o.message}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Suivi commercial</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {write ? (
              <OpportunityForm
                id={o.id}
                members={members}
                initial={{
                  stage: o.stage,
                  estimatedAmount: o.estimatedAmount ?? "",
                  probability: o.probability,
                  lossReason: o.lossReason ?? "",
                  ownerId: o.owner?.id ?? "",
                }}
              />
            ) : (
              <dl>
                <Row label="Montant estimé">{o.estimatedAmount ? formatMoney(o.estimatedAmount, currency) : "—"}</Row>
                <Row label="Probabilité">{o.probability} %</Row>
                <Row label="Responsable">{o.owner?.name ?? "—"}</Row>
                {o.lossReason ? <Row label="Motif de perte">{o.lossReason}</Row> : null}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
