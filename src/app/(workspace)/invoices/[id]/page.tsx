import { Download, Pencil, Stamp, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { Alert } from "@/components/feedback/alert";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditNoteDialog, PaymentDialog } from "@/features/invoices/components/invoice-actions";
import { formatDate } from "@/lib/dates";
import { invoiceStatusLabels, invoiceStatusTones, lineKindLabels, paymentMethodLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getInvoice } from "@/server/services/invoice-service";

export const metadata = { title: "Facture" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("invoices:read");
  const { id } = await params;
  const i = await loadOr404(() => getInvoice(ctx, id));
  const tz = ctx.organization.timezone;
  const isCredit = i.kind === "CREDIT_NOTE";
  const label = isCredit ? "Avoir" : "Facture";
  const overdue = !isCredit && Number(i.balanceDue) > 0 && i.dueDate && new Date(i.dueDate) < new Date();
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {label} {i.number ?? "(brouillon)"} <StatusBadge value={i.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
          </span>
        }
        description={
          <span>
            {i.title} ·{" "}
            <Link href={`/customers/${i.customer.id}`} className="hover:underline">
              {i.customer.name}
            </Link>
            {i.creditedInvoice ? (
              <>
                {" · sur "}
                <Link href={`/invoices/${i.creditedInvoice.id}`} className="hover:underline">
                  {i.creditedInvoice.number}
                </Link>
              </>
            ) : null}
          </span>
        }
        breadcrumbs={[{ label: "Factures", href: "/invoices" }, { label: i.number ?? "Brouillon" }]}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/invoices/${i.id}/pdf`}>
                <Download /> PDF
              </a>
            </Button>
            {i.status === "DRAFT" && can(ctx, "invoices:write") ? (
              <>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/invoices/${i.id}/edit`}>
                    <Pencil /> Modifier
                  </Link>
                </Button>
                <ActionButton url={`/api/invoices/${i.id}`} method="DELETE" size="sm" variant="ghost" successMessage="Brouillon supprimé" redirectTo="/invoices" confirm={{ title: "Supprimer ce brouillon ?", description: "Aucun numéro n'a été attribué : la suppression n'affecte pas la numérotation.", destructive: true }}>
                  <Trash2 /> Supprimer
                </ActionButton>
              </>
            ) : null}
            {i.status === "DRAFT" && can(ctx, "invoices:issue") ? (
              <ActionButton url={`/api/invoices/${i.id}/issue`} size="sm" successMessage={`${label} émis(e)`} confirm={{ title: `Émettre ${isCredit ? "l'avoir" : "la facture"} ?`, description: "Un numéro définitif sera attribué. Le document ne pourra plus être modifié ni supprimé ; toute correction passera par un avoir.", confirmLabel: "Émettre" }}>
                <Stamp /> Émettre
              </ActionButton>
            ) : null}
            {!isCredit && (i.status === "ISSUED" || i.status === "PARTIALLY_PAID") && can(ctx, "payments:write") ? <PaymentDialog invoiceId={i.id} balanceDue={i.balanceDue} /> : null}
            {!isCredit && i.status !== "DRAFT" && i.status !== "CANCELLED" && can(ctx, "invoices:issue") ? <CreditNoteDialog invoiceId={i.id} number={i.number ?? ""} /> : null}
          </>
        }
      />
      {i.status === "DRAFT" ? <Alert tone="info" className="mb-4">Brouillon : document non valable, sans numéro. Émettez-le pour lui attribuer un numéro définitif.</Alert> : null}
      {overdue ? <Alert tone="danger" className="mb-4" title="Paiement en retard">Échéance dépassée depuis le {formatDate(i.dueDate, tz)}.</Alert> : null}
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
                  <TableHead className="text-right">TVA</TableHead>
                  <TableHead className="text-right">Total HT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {i.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-muted-foreground">{lineKindLabels[l.kind]}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.days)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.vatRate)} %</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoney(l.totalExclTax)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {!isCredit && i.payments.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Paiements</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {i.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.paidAt, tz)}</TableCell>
                      <TableCell>{paymentMethodLabels[p.method]}</TableCell>
                      <TableCell className="text-muted-foreground">{p.reference ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Montants</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total HT</dt>
                  <dd className="tabular-nums">{formatMoney(i.totalExclTax)}</dd>
                </div>
                {i.vat.map((v) => (
                  <div key={v.rate} className="flex justify-between">
                    <dt className="text-muted-foreground">TVA {Number(v.rate)} %</dt>
                    <dd className="tabular-nums">{formatMoney(v.tax)}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-2 font-semibold">
                  <dt>Total TTC</dt>
                  <dd className="tabular-nums">{formatMoney(i.totalInclTax)}</dd>
                </div>
                {!isCredit && i.status !== "DRAFT" ? (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Encaissé</dt>
                      <dd className="tabular-nums">{formatMoney(i.amountPaid)}</dd>
                    </div>
                    {Number(i.creditedTotal) ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Avoirs</dt>
                        <dd className="tabular-nums">− {formatMoney(i.creditedTotal)}</dd>
                      </div>
                    ) : null}
                    <div className={`flex justify-between text-base font-semibold ${Number(i.balanceDue) > 0 ? "text-warning" : "text-success"}`}>
                      <dt>Reste dû</dt>
                      <dd className="tabular-nums">{formatMoney(i.balanceDue)}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1.5 pt-5 text-sm">
              <p>Émise le {formatDate(i.issueDate, tz)}</p>
              {!isCredit ? <p>Échéance {formatDate(i.dueDate, tz)}</p> : null}
              {i.event ? (
                <Link href={`/events/${i.event.id}`} className="hover:underline">
                  Événement {i.event.reference}
                </Link>
              ) : null}
              {i.quote ? (
                <Link href={`/quotes/${i.quote.id}`} className="hover:underline">
                  Devis {i.quote.number}
                </Link>
              ) : null}
              {i.creditNotes.map((c) => (
                <Link key={c.id} href={`/invoices/${c.id}`} className="flex items-center justify-between rounded-lg border border-border p-2 hover:border-primary/40">
                  Avoir {c.number ?? "brouillon"} · {formatMoney(c.totalInclTax)} <StatusBadge value={c.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
                </Link>
              ))}
              {i.notes ? <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{i.notes}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
