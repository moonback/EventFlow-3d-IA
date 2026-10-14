import { Archive, ArchiveRestore, ImageOff, Pencil } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddAssetDialog, MovementDialog, PhotoUpload, SendToMaintenanceDialog } from "@/features/inventory/components/stock-dialogs";
import { StockBreakdown } from "@/features/inventory/components/stock-breakdown";
import { formatDateTime } from "@/lib/dates";
import { assetStatusLabels, locationKindLabels, maintenanceStatusLabels, movementTypeLabels, reservationStatusLabels, reservationStatusTones } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getProduct, locationOptions } from "@/server/services/inventory-service";
import { listMovements } from "@/server/services/stock-movement-service";

export const metadata = { title: "Fiche matériel" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("inventory:read");
  const { id } = await params;
  const p = await loadOr404(() => getProduct(ctx, id));
  const tz = ctx.organization.timezone;
  const [movements, locations] = await Promise.all([
    can(ctx, "stock:read") ? listMovements(ctx, { productId: id, page: 1, pageSize: 25, dir: "desc" }) : Promise.resolve(null),
    can(ctx, "stock:read") ? locationOptions(ctx) : Promise.resolve([]),
  ]);
  const storageBalances = p.balances.filter((b) => ["WAREHOUSE", "ZONE", "RACK", "BIN", "RETURN"].includes(b.location.kind)).map((b) => ({ locationId: b.location.id, code: b.location.code, quantity: b.quantity }));
  const allBalances = p.balances.filter((b) => b.location.kind !== "OUT").map((b) => ({ locationId: b.location.id, code: b.location.code, quantity: b.quantity }));
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name} {p.archivedAt ? <Badge>Archivé</Badge> : null}
          </span>
        }
        description={
          <span>
            <span className="font-mono">{p.sku}</span> · {p.category.name}
            {p.barcode ? ` · code-barres ${p.barcode}` : ""}
          </span>
        }
        breadcrumbs={[{ label: "Catalogue", href: "/inventory" }, { label: p.sku }]}
        actions={
          <>
            {can(ctx, "stock:write") && p.stockManaged ? <MovementDialog productId={p.id} locations={locations} balances={allBalances} /> : null}
            {can(ctx, "maintenance:write") && p.stockManaged && storageBalances.length ? <SendToMaintenanceDialog productId={p.id} balances={storageBalances} /> : null}
            {can(ctx, "inventory:write") ? (
              <>
                <PhotoUpload productId={p.id} />
                <ActionButton url={`/api/inventory/products/${p.id}/archive`} body={{ archived: !p.archivedAt }} size="sm" variant="outline" successMessage={p.archivedAt ? "Référence restaurée" : "Référence archivée"} confirm={p.archivedAt ? undefined : { title: "Archiver cette référence ?", description: "Elle ne pourra plus être réservée. L'historique est conservé." }}>
                  {p.archivedAt ? <ArchiveRestore /> : <Archive />} {p.archivedAt ? "Restaurer" : "Archiver"}
                </ActionButton>
                <Button size="sm" asChild>
                  <Link href={`/inventory/${p.id}/edit`}>
                    <Pencil /> Modifier
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="overflow-hidden">
          {p.photoDocumentId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/inventory/products/${p.id}/photo`} alt={p.name} className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
              <ImageOff className="size-8" aria-hidden />
              <span className="text-xs">Aucune photo</span>
            </div>
          )}
          <CardContent className="flex flex-col gap-2 pt-4 text-sm">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Location / jour</span> <span className="tabular-nums">{formatMoney(p.rentalPrice)}</span>
            </p>
            {p.replacementValue ? (
              <p className="flex justify-between">
                <span className="text-muted-foreground">Valeur de remplacement</span> <span className="tabular-nums">{formatMoney(p.replacementValue)}</span>
              </p>
            ) : null}
            <p className="flex justify-between">
              <span className="text-muted-foreground">Unité</span> <span>{p.unit}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Seuil d&apos;alerte</span> <span>{p.alertThreshold}</span>
            </p>
            {p.weightKg ? (
              <p className="flex justify-between">
                <span className="text-muted-foreground">Poids</span> <span>{p.weightKg} kg</span>
              </p>
            ) : null}
            {p.supplier ? (
              <p className="flex justify-between">
                <span className="text-muted-foreground">Fournisseur</span>
                <Link href={`/suppliers/${p.supplier.id}`} className="hover:underline">
                  {p.supplier.name}
                </Link>
              </p>
            ) : null}
            {p.description ? <p className="mt-2 text-muted-foreground">{p.description}</p> : null}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          {p.summary ? (
            <Card>
              <CardHeader>
                <CardTitle>État du stock</CardTitle>
              </CardHeader>
              <CardContent>
                <StockBreakdown summary={p.summary} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-5 text-sm text-muted-foreground">Référence non gérée en stock (consommable / prestation) : aucune disponibilité n&apos;est contrôlée.</CardContent>
            </Card>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Emplacements</CardTitle>
              </CardHeader>
              <CardContent>
                {p.balances.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun stock.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {p.balances.map((b) => (
                      <li key={b.location.id} className="flex items-center justify-between py-2">
                        <Link href={`/warehouse/locations/${b.location.id}`} className="hover:underline">
                          <span className="font-mono">{b.location.code}</span> <span className="text-muted-foreground">· {locationKindLabels[b.location.kind]}</span>
                        </Link>
                        <span className="font-semibold tabular-nums">{b.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Réservations actives</CardTitle>
              </CardHeader>
              <CardContent>
                {p.reservations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune réservation en cours ou à venir.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {p.reservations.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="min-w-0">
                          <Link href={`/reservations/${r.id}`} className="font-medium hover:underline">
                            {r.reference}
                          </Link>{" "}
                          · {r.event.name}
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTime(r.startAt, tz)} → {formatDateTime(r.endAt, tz)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">×{r.quantity}</span>
                          <StatusBadge value={r.status} labels={reservationStatusLabels} tones={reservationStatusTones} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          {p.maintenanceTickets.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Maintenance en cours</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border text-sm">
                  {p.maintenanceTickets.map((t) => (
                    <li key={t.id} className="flex justify-between py-2">
                      <Link href="/maintenance" className="hover:underline">
                        {t.reference} — {t.title}
                      </Link>
                      <span>
                        ×{t.quantity} · {maintenanceStatusLabels[t.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {p.serialized ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Unités sérialisées ({p.assets.length})</CardTitle>
                {can(ctx, "inventory:write") ? <AddAssetDialog productId={p.id} locations={locations} /> : null}
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {p.assets.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <span className="font-mono">{a.serialNumber}</span>
                      <span className="text-xs text-muted-foreground">
                        {assetStatusLabels[a.status]} {a.location ? `· ${a.location.code}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {movements ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Historique des mouvements</CardTitle>
                <Link href={`/inventory/movements?productId=${p.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                  Journal complet
                </Link>
              </CardHeader>
              {movements.items.length === 0 ? (
                <CardContent>
                  <EmptyState title="Aucun mouvement" />
                </CardContent>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qté</TableHead>
                      <TableHead>De → Vers</TableHead>
                      <TableHead>Motif</TableHead>
                      <TableHead>Par</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.items.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(m.occurredAt, tz)}</TableCell>
                        <TableCell>{movementTypeLabels[m.type]}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.quantity}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {m.fromLocation?.code ?? "—"} → {m.toLocation?.code ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">{m.reason ?? (m.reservation ? m.reservation.reference : "—")}</TableCell>
                        <TableCell>{m.user?.name ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
