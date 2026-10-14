import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { PageHeader } from "@/components/feedback/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReceiveDialog } from "@/features/purchases/components/purchase-forms";
import { formatDate, formatDateTime } from "@/lib/dates";
import { purchaseOrderStatusLabels } from "@/lib/labels";
import { dec, formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { locationOptions } from "@/server/services/inventory-service";
import { getPurchaseOrder } from "@/server/services/purchase-service";

export const metadata = { title: "Commande fournisseur" };

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("purchases:read");
  const { id } = await params;
  const po = await loadOr404(() => getPurchaseOrder(ctx, id));
  const tz = ctx.organization.timezone;
  const locations = can(ctx, "purchases:receive") ? await locationOptions(ctx, ["WAREHOUSE", "ZONE", "RACK", "BIN", "RETURN"]) : [];
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {po.number} <Badge>{purchaseOrderStatusLabels[po.status]}</Badge>
          </span>
        }
        description={
          <Link href={`/suppliers/${po.supplier.id}`} className="hover:underline">
            {po.supplier.name}
          </Link>
        }
        breadcrumbs={[{ label: "Achats", href: "/purchases" }, { label: po.number }]}
        actions={
          <>
            {po.status === "DRAFT" && can(ctx, "purchases:write") ? (
              <ActionButton url={`/api/purchase-orders/${po.id}/order`} size="sm" successMessage="Commande passée" confirm={{ title: "Passer la commande ?", description: "La commande sera marquée comme envoyée au fournisseur. Le stock n'évoluera qu'à la réception." }}>
                Passer la commande
              </ActionButton>
            ) : null}
            {(po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED") && can(ctx, "purchases:receive") ? (
              <ReceiveDialog orderId={po.id} locations={locations} lines={po.lines.map((l) => ({ id: l.id, name: l.product.name, remaining: l.quantityOrdered - l.quantityReceived, defaultLocationId: l.product.defaultLocationId }))} />
            ) : null}
            {(po.status === "DRAFT" || po.status === "ORDERED") && can(ctx, "purchases:write") ? (
              <ActionButton url={`/api/purchase-orders/${po.id}/cancel`} size="sm" variant="outline" successMessage="Commande annulée" confirm={{ title: "Annuler la commande ?", description: po.number, destructive: true }}>
                Annuler
              </ActionButton>
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produit</TableHead>
                <TableHead className="text-right">Commandé</TableHead>
                <TableHead className="text-right">Reçu</TableHead>
                <TableHead className="text-right">Coût unitaire</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link href={`/inventory/${l.product.id}`} className="hover:underline">
                      {l.product.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantityOrdered}</TableCell>
                  <TableCell className={`text-right tabular-nums ${l.quantityReceived < l.quantityOrdered ? "text-warning" : "text-success"}`}>{l.quantityReceived}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(l.unitCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(dec(l.unitCost).mul(l.quantityOrdered))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CardContent className="flex justify-end pt-4 font-semibold">Total HT {formatMoney(po.totalExclTax)}</CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-1 pt-5 text-sm">
              <p>Créée le {formatDate(po.createdAt, tz)}</p>
              <p>Commandée le {formatDate(po.orderedAt, tz)}</p>
              <p>Livraison attendue {formatDate(po.expectedAt, tz)}</p>
              {po.supplierInvoiceRef ? <p>Facture fournisseur : {po.supplierInvoiceRef}</p> : null}
              {po.notes ? <p className="text-muted-foreground">{po.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Réceptions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {po.receipts.length === 0 ? <p className="text-muted-foreground">Aucune réception.</p> : null}
              {po.receipts.map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-2">
                  <p className="font-medium">{formatDateTime(r.receivedAt, tz)}</p>
                  {r.lines.map((l, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {l.orderLine.product.name} × {l.quantity}
                    </p>
                  ))}
                  {r.notes ? <p className="text-xs">{r.notes}</p> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
