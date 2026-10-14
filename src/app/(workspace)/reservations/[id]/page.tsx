import { Download, Eye, FileText, Pencil } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CancelReservationDialog, LossDialog, PrepareDialog, ReturnDialog, ShipDialog, UnprepareDialog, type OpLine } from "@/features/reservations/components/operations";
import { formatDateTime } from "@/lib/dates";
import { reservationStatusLabels, reservationStatusTones } from "@/lib/labels";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { locationOptions } from "@/server/services/inventory-service";
import { getReservation } from "@/server/services/reservation-service";

export const metadata = { title: "Réservation" };

const STEPS = ["DRAFT", "CONFIRMED", "IN_PREPARATION", "PREPARED", "SHIPPED", "RETURNED"] as const;

export default async function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("reservations:read");
  const { id } = await params;
  const r = await loadOr404(() => getReservation(ctx, id));
  const tz = r.event.timezone;
  const ops = can(ctx, "logistics:operate");
  const [storage, returnLocations] = ops ? await Promise.all([locationOptions(ctx, ["WAREHOUSE", "ZONE", "RACK", "BIN"]), locationOptions(ctx, ["RETURN", "RACK", "BIN", "ZONE"])]) : [[], []];
  const lines: OpLine[] = r.lines.map((l) => ({
    productId: l.product.id,
    sku: l.product.sku,
    name: l.product.name,
    quantity: l.quantity,
    prepared: l.quantityPrepared,
    shipped: l.quantityShipped,
    outstanding: l.outstanding,
    stockManaged: l.product.stockManaged,
    balances: l.product.balances,
    defaultLocationId: l.product.defaultLocation?.id ?? null,
  }));
  const s = r.status;
  const stepIndex = s === "PENDING" ? 0 : s === "PARTIALLY_RETURNED" ? 4 : STEPS.indexOf(s as (typeof STEPS)[number]);
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {r.reference} <StatusBadge value={s} labels={reservationStatusLabels} tones={reservationStatusTones} />
          </span>
        }
        description={
          <span>
            <Link href={`/events/${r.event.id}`} className="hover:underline">
              {r.event.reference} — {r.event.name}
            </Link>{" "}
            · {r.event.customer.name}
          </span>
        }
        breadcrumbs={[{ label: "Réservations", href: "/reservations" }, { label: r.reference }]}
        actions={
          <>
            {can(ctx, "reservations:write") && ["DRAFT", "PENDING", "CONFIRMED"].includes(s) ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/reservations/${r.id}/edit`}>
                  <Pencil /> Modifier
                </Link>
              </Button>
            ) : null}
            {s === "DRAFT" && can(ctx, "reservations:write") ? (
              <ActionButton url={`/api/reservations/${r.id}/submit`} size="sm" variant="outline" successMessage="Réservation mise en attente">
                Mettre en attente
              </ActionButton>
            ) : null}
            {(s === "DRAFT" || s === "PENDING") && can(ctx, "reservations:confirm") ? (
              <ActionButton url={`/api/reservations/${r.id}/confirm`} size="sm" successMessage="Réservation confirmée : stock bloqué" confirm={{ title: "Confirmer la réservation ?", description: "La disponibilité est revérifiée par le serveur ; si elle suffit, le stock est bloqué sur la période.", confirmLabel: "Confirmer" }}>
                Confirmer
              </ActionButton>
            ) : null}
            {ops && ["CONFIRMED", "IN_PREPARATION", "PREPARED"].includes(s) ? <PrepareDialog reservationId={r.id} lines={lines} /> : null}
            {ops && ["IN_PREPARATION", "PREPARED"].includes(s) ? (
              <>
                <UnprepareDialog reservationId={r.id} lines={lines} storage={storage} />
                <ShipDialog reservationId={r.id} lines={lines} />
              </>
            ) : null}
            {ops && ["SHIPPED", "PARTIALLY_RETURNED"].includes(s) ? (
              <>
                <ReturnDialog reservationId={r.id} lines={lines} returnLocations={returnLocations} />
                {can(ctx, "stock:write") ? <LossDialog reservationId={r.id} lines={lines} /> : null}
              </>
            ) : null}
            {can(ctx, "reservations:confirm") && ["DRAFT", "PENDING", "CONFIRMED", "IN_PREPARATION", "PREPARED"].includes(s) ? <CancelReservationDialog reservationId={r.id} /> : null}
          </>
        }
      />
      {s !== "CANCELLED" ? (
        <ol className="mb-6 flex flex-wrap items-center gap-2 text-xs" aria-label="Étapes de la réservation">
          {["Brouillon", "Confirmée", "En préparation", "Préparée", "Expédiée", "Retournée"].map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 ${i < stepIndex ? "bg-success/15 text-success" : i === stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`} aria-current={i === stepIndex ? "step" : undefined}>
                {label}
              </span>
              {i < 5 ? <span className="h-px w-4 bg-border" aria-hidden /> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">Annulée : {r.cancelReason}</p>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Liste de préparation</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Emplacements</TableHead>
                  <TableHead className="text-right">Demandé</TableHead>
                  <TableHead className="text-right">Préparé</TableHead>
                  <TableHead className="text-right">Manquant</TableHead>
                  <TableHead className="text-right">Expédié</TableHead>
                  <TableHead className="text-right">Retourné</TableHead>
                  <TableHead className="text-right">Endomm.</TableHead>
                  <TableHead className="text-right">Perdu</TableHead>
                  <TableHead className="text-right">Dehors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.lines.map((l) => {
                  const missing = Math.max(0, l.quantity - l.quantityPrepared);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Link href={`/inventory/${l.product.id}`} className="font-medium hover:underline">
                          {l.product.name}
                        </Link>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {l.product.sku} {!l.product.stockManaged ? <Badge>Non suivi</Badge> : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.product.balances.map((b) => `${b.location.code} (${b.quantity})`).join(", ") || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantityPrepared}</TableCell>
                      <TableCell className={`text-right tabular-nums ${missing && ["CONFIRMED", "IN_PREPARATION"].includes(s) ? "text-warning" : ""}`}>{missing}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantityShipped}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantityReturned}</TableCell>
                      <TableCell className={`text-right tabular-nums ${l.quantityDamaged ? "text-destructive" : ""}`}>{l.quantityDamaged}</TableCell>
                      <TableCell className={`text-right tabular-nums ${l.quantityLost ? "text-destructive" : ""}`}>{l.quantityLost}</TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${l.outstanding ? "text-info" : ""}`}>{l.outstanding}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          {r.inspections.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Contrôles au retour</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {r.inspections.map((i) => (
                  <div key={i.id}>
                    <p className="text-sm font-medium">{formatDateTime(i.createdAt, tz)}</p>
                    {i.notes ? <p className="text-xs text-muted-foreground">{i.notes}</p> : null}
                    <ul className="mt-1 text-sm">
                      {i.lines.map((l) => (
                        <li key={l.productId} className="flex flex-wrap gap-x-3">
                          <span className="font-medium">{l.product.name}</span>
                          <span className="text-muted-foreground">
                            attendu {l.quantityExpected} · bon {l.quantityGood} · endommagé {l.quantityDamaged} · manquant {l.quantityMissing}
                          </span>
                          {l.anomaly ? <span className="text-destructive">{l.anomaly}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Période</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p>
                Du <strong>{formatDateTime(r.startAt, tz)}</strong>
              </p>
              <p>
                au <strong>{formatDateTime(r.endAt, tz)}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Tampons : préparation {r.prepBufferHours} h · retour {r.returnBufferHours} h
              </p>
              {r.notes ? <p className="mt-2 rounded-lg bg-muted p-2 text-muted-foreground">{r.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Documents logistiques</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(
                [
                  ["picking", "Bon de préparation"],
                  ["delivery", "Bon de livraison"],
                  ["return", "Fiche de retour"],
                ] as const
              ).map(([type, label]) => (
                <div key={type} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" aria-hidden /> {label}
                  </span>
                  <span className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a href={`/api/reservations/${r.id}/sheet/${type}?inline=1`} target="_blank" rel="noopener" aria-label={`Aperçu ${label}`}>
                        <Eye />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a href={`/api/reservations/${r.id}/sheet/${type}`} aria-label={`Télécharger ${label}`}>
                        <Download />
                      </a>
                    </Button>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Historique</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-2 border-l border-border pl-3">
                {r.history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <span className="font-medium">{reservationStatusLabels[h.toStatus]}</span>
                    {h.comment ? <span className="text-muted-foreground"> — {h.comment}</span> : null}
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(h.createdAt, tz)} · {h.userName ?? "—"}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
