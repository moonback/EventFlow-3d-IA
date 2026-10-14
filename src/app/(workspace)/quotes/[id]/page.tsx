import { Copy, Download, Pencil, Receipt, Send, XCircle } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AcceptQuoteButton, SendQuoteButton } from "@/features/quotes/components/quote-actions";
import { formatDate, formatDateTime } from "@/lib/dates";
import { invoiceStatusLabels, invoiceStatusTones, lineKindLabels, quoteStatusLabels, quoteStatusTones } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getQuote } from "@/server/services/quote-service";

export const metadata = { title: "Devis" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("quotes:read");
  const { id } = await params;
  const q = await loadOr404(() => getQuote(ctx, id));
  const tz = ctx.organization.timezone;
  const write = can(ctx, "quotes:write");
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Devis {q.number} <StatusBadge value={q.status} labels={quoteStatusLabels} tones={quoteStatusTones} />
          </span>
        }
        description={
          <span>
            {q.title} ·{" "}
            <Link href={`/customers/${q.customer.id}`} className="hover:underline">
              {q.customer.name}
            </Link>
            {q.event ? (
              <>
                {" · "}
                <Link href={`/events/${q.event.id}`} className="hover:underline">
                  {q.event.reference}
                </Link>
              </>
            ) : null}
          </span>
        }
        breadcrumbs={[{ label: "Devis", href: "/quotes" }, { label: q.number }]}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/quotes/${q.id}/pdf`}>
                <Download /> PDF
              </a>
            </Button>
            {q.status === "DRAFT" && write ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/quotes/${q.id}/edit`}>
                  <Pencil /> Modifier
                </Link>
              </Button>
            ) : null}
            {q.status === "DRAFT" && can(ctx, "quotes:send") ? (
              <ActionButton url={`/api/quotes/${q.id}/issue`} size="sm" variant="outline" successMessage="Devis émis (non modifiable)" confirm={{ title: "Émettre le devis ?", description: "Le devis sera daté et figé. Il pourra être envoyé au client ; toute modification nécessitera une nouvelle version.", confirmLabel: "Émettre" }}>
                <Send /> Émettre
              </ActionButton>
            ) : null}
            {(q.status === "DRAFT" || q.status === "SENT") && can(ctx, "quotes:send") ? <SendQuoteButton quoteId={q.id} email={q.customer.email} /> : null}
            {q.status === "SENT" && write ? (
              <>
                <AcceptQuoteButton quoteId={q.id} hasEvent={Boolean(q.event)} />
                <ActionButton url={`/api/quotes/${q.id}/decline`} size="sm" variant="outline" successMessage="Devis marqué refusé" confirm={{ title: "Marquer comme refusé ?", description: "Le client a décliné la proposition.", destructive: true }}>
                  <XCircle /> Refusé
                </ActionButton>
                <ActionButton url={`/api/quotes/${q.id}/revise`} size="sm" variant="outline" successMessage="Nouvelle version créée" redirectTo={{ prefix: "/quotes" }} confirm={{ title: "Créer une nouvelle version ?", description: "La version actuelle sera annulée ; une copie modifiable est créée." }}>
                  <Copy /> Nouvelle version
                </ActionButton>
              </>
            ) : null}
            {q.status === "ACCEPTED" && can(ctx, "invoices:write") && q.invoices.length === 0 ? (
              <ActionButton url={`/api/quotes/${q.id}/invoice`} size="sm" successMessage="Facture brouillon créée" redirectTo={{ prefix: "/invoices" }}>
                <Receipt /> Facturer
              </ActionButton>
            ) : null}
            {(q.status === "DRAFT" || q.status === "SENT") && write ? (
              <ActionButton url={`/api/quotes/${q.id}/cancel`} size="sm" variant="ghost" successMessage="Devis annulé" confirm={{ title: "Annuler ce devis ?", description: "Il restera consultable mais ne pourra plus être accepté.", destructive: true }}>
                Annuler
              </ActionButton>
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead className="text-right">Jours</TableHead>
                  <TableHead className="text-right">PU HT</TableHead>
                  <TableHead className="text-right">Rem.</TableHead>
                  <TableHead className="text-right">TVA</TableHead>
                  <TableHead className="text-right">Total HT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-muted-foreground">{lineKindLabels[l.kind]}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.days)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.discountPercent) ? `${Number(l.discountPercent)} %` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.vatRate)} %</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoney(l.totalExclTax)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Aperçu PDF</CardTitle>
            </CardHeader>
            <iframe title={`Aperçu du devis ${q.number}`} src={`/api/quotes/${q.id}/pdf?inline=1`} className="h-[720px] w-full border-t border-border bg-white" />
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Totaux</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Sous-total HT</dt>
                  <dd className="tabular-nums">{formatMoney(q.subtotalExclTax)}</dd>
                </div>
                {Number(q.globalDiscountAmount) ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Remise {q.globalDiscountPercent} %</dt>
                    <dd className="tabular-nums">− {formatMoney(q.globalDiscountAmount)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total HT</dt>
                  <dd className="tabular-nums">{formatMoney(q.totalExclTax)}</dd>
                </div>
                {q.vat.map((v) => (
                  <div key={v.rate} className="flex justify-between">
                    <dt className="text-muted-foreground">
                      TVA {Number(v.rate)} % <span className="text-xs">(base {formatMoney(v.base)})</span>
                    </dt>
                    <dd className="tabular-nums">{formatMoney(v.tax)}</dd>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <dt>Total TTC</dt>
                  <dd className="tabular-nums">{formatMoney(q.totalInclTax)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Suivi</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <p>Créé le {formatDate(q.createdAt, tz)} · version {q.version}</p>
              <p>Émis le {formatDate(q.issueDate, tz)}</p>
              <p>Valable jusqu&apos;au {formatDate(q.validUntil, tz)}</p>
              {q.sentAt ? <p>Envoyé par e-mail le {formatDateTime(q.sentAt, tz)}</p> : null}
              {q.acceptedAt ? <p className="text-success">Accepté le {formatDate(q.acceptedAt, tz)}</p> : null}
              {q.declinedAt ? <p className="text-destructive">Refusé le {formatDate(q.declinedAt, tz)}</p> : null}
              {q.reservationId ? (
                <Link href={`/reservations/${q.reservationId}`} className="text-primary hover:underline">
                  Voir la réservation liée
                </Link>
              ) : null}
              {q.invoices.map((i) => (
                <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between rounded-lg border border-border p-2 hover:border-primary/40">
                  Facture {i.number ?? "brouillon"} <StatusBadge value={i.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
                </Link>
              ))}
            </CardContent>
          </Card>
          {q.notes || q.terms ? (
            <Card>
              <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                {q.notes ? <p className="whitespace-pre-wrap">{q.notes}</p> : null}
                {q.terms ? <p className="whitespace-pre-wrap text-muted-foreground">{q.terms}</p> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
