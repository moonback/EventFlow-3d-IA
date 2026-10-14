import { Archive, ArchiveRestore, Pencil, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { PageHeader } from "@/components/feedback/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { purchaseOrderStatusLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getSupplier } from "@/server/services/supplier-service";

export const metadata = { title: "Fournisseur" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("suppliers:read");
  const { id } = await params;
  const s = await loadOr404(() => getSupplier(ctx, id));
  const write = can(ctx, "suppliers:write");
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {s.name} {s.archivedAt ? <Badge>Archivé</Badge> : null}
          </span>
        }
        description={[s.city, s.email, s.phone].filter(Boolean).join(" · ")}
        breadcrumbs={[{ label: "Fournisseurs", href: "/suppliers" }, { label: s.name }]}
        actions={
          <>
            {can(ctx, "purchases:write") ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/purchases/new?supplierId=${s.id}`}>
                  <ShoppingCart /> Commander
                </Link>
              </Button>
            ) : null}
            {write ? (
              <>
                <ActionButton url={`/api/suppliers/${s.id}/archive`} body={{ archived: !s.archivedAt }} size="sm" variant="outline" successMessage="Fournisseur mis à jour">
                  {s.archivedAt ? <ArchiveRestore /> : <Archive />} {s.archivedAt ? "Restaurer" : "Archiver"}
                </ActionButton>
                <Button size="sm" asChild>
                  <Link href={`/suppliers/${s.id}/edit`}>
                    <Pencil /> Modifier
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {s.contacts.length === 0 ? <p className="text-muted-foreground">Aucun contact</p> : null}
            {s.contacts.map((c) => (
              <p key={c.id} className="py-1">
                <span className="font-medium">
                  {c.firstName} {c.lastName}
                </span>
                <span className="block text-xs text-muted-foreground">{[c.jobTitle, c.email, c.phone].filter(Boolean).join(" · ")}</span>
              </p>
            ))}
            {s.notes ? <p className="mt-3 rounded-lg bg-muted p-2 text-muted-foreground">{s.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Produits ({s.products.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {s.products.map((p) => (
              <Link key={p.id} href={`/inventory/${p.id}`} className="hover:underline">
                {p.name} <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Commandes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {s.orders.length === 0 ? <p className="text-muted-foreground">Aucune commande</p> : null}
            {s.orders.map((o) => (
              <Link key={o.id} href={`/purchases/${o.id}`} className="flex justify-between rounded-lg border border-border p-2 hover:border-primary/40">
                <span>
                  {o.number}
                  <span className="block text-xs text-muted-foreground">{formatDate(o.createdAt, ctx.organization.timezone)}</span>
                </span>
                <span className="text-right">
                  {formatMoney(o.totalExclTax)}
                  <span className="block text-xs text-muted-foreground">{purchaseOrderStatusLabels[o.status]}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
