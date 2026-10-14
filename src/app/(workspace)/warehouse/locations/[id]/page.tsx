import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { locationKindLabels } from "@/lib/labels";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getLocation, listLocations } from "@/server/services/inventory-service";
import { LocationDialog } from "../../location-form";

export const metadata = { title: "Emplacement" };

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("stock:read");
  const { id } = await params;
  const [l, all] = await Promise.all([loadOr404(() => getLocation(ctx, id)), listLocations(ctx)]);
  const total = l.balances.reduce((a, b) => a + b.quantity, 0);
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{l.code}</span> {l.name} <Badge>{locationKindLabels[l.kind]}</Badge> {!l.isActive ? <Badge tone="warning">Désactivé</Badge> : null}
          </span>
        }
        description={`${l.balances.length} référence(s) · ${total} unité(s)${l.parent ? ` · dans ${l.parent.code}` : ""}`}
        breadcrumbs={[{ label: "Entrepôt", href: "/warehouse" }, { label: l.code }]}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/world?focus=STOCK_LOCATION:${l.id}`}>Localiser en 3D</Link>
            </Button>
            {can(ctx, "stock:write") ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/inventory/count?locationId=${l.id}`}>Inventorier</Link>
              </Button>
            ) : null}
            {can(ctx, "inventory:write") ? (
              <LocationDialog locationId={l.id} parents={all.map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` }))} initial={{ code: l.code, name: l.name, kind: l.kind, parentId: l.parent?.id ?? "", description: l.description ?? "", isActive: l.isActive }} />
            ) : null}
          </>
        }
      />
      {l.children.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {l.children.map((c) => (
            <Link key={c.id} href={`/warehouse/locations/${c.id}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary">
              <span className="font-mono">{c.code}</span> <span className="text-muted-foreground">{c.name}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {l.balances.length === 0 ? (
        <EmptyState title="Emplacement vide" />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Quantité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {l.balances.map((b) => (
                <TableRow key={b.product.id}>
                  <TableCell>
                    <Link href={`/inventory/${b.product.id}`} className="font-medium hover:underline">
                      {b.product.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{b.product.sku}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: b.product.category.color }} aria-hidden /> {b.product.category.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {b.quantity} {b.product.unit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
