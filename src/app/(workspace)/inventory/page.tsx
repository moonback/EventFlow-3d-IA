import { Boxes, ClipboardCheck, Download, FileText, History, Plus, Tags } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listCategories, listProducts } from "@/server/services/inventory-service";

export const metadata = { title: "Catalogue & stock" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("inventory:read");
  const sp = await searchParams;
  const query = parseListParams(sp, { sort: "name", pageSize: 50 });
  const [data, categories] = await Promise.all([
    listProducts(ctx, { ...query, categoryId: firstParam(sp.categoryId), lowStock: firstParam(sp.lowStock) === "true", archived: firstParam(sp.archived) === "true" }),
    listCategories(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Catalogue & stock"
        description={`${data.total} référence(s) · disponibilités calculées en temps réel`}
        actions={
          <>
            {can(ctx, "stock:read") ? (
              <Button size="sm" variant="outline" asChild>
                <Link href="/inventory/movements">
                  <History /> Mouvements
                </Link>
              </Button>
            ) : null}
            {can(ctx, "stock:write") ? (
              <Button size="sm" variant="outline" asChild>
                <Link href="/inventory/count">
                  <ClipboardCheck /> Inventaire
                </Link>
              </Button>
            ) : null}
            {can(ctx, "inventory:write") ? (
              <Button size="sm" variant="outline" asChild>
                <Link href="/inventory/categories">
                  <Tags /> Catégories
                </Link>
              </Button>
            ) : null}
            {can(ctx, "reports:export") ? (
              <>
                <Button size="sm" variant="outline" asChild>
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- téléchargement de fichier, pas une navigation */}
                  <a href="/api/exports/products">
                    <Download /> CSV
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href="/api/exports/stock-pdf?inline=1" target="_blank" rel="noopener">
                    <FileText /> Rapport PDF
                  </a>
                </Button>
              </>
            ) : null}
            {can(ctx, "inventory:write") ? (
              <Button size="sm" asChild>
                <Link href="/inventory/new">
                  <Plus /> Référence
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <ListToolbar
        placeholder="Nom, SKU ou code-barres…"
        filters={[
          { name: "categoryId", label: "Toutes catégories", options: categories.map((c) => ({ value: c.id, label: `${c.name} (${c.productCount})` })) },
          { name: "lowStock", label: "Tous niveaux de stock", options: [{ value: "true", label: "Sous le seuil d'alerte" }] },
          { name: "archived", label: "Références actives", options: [{ value: "true", label: "Archivées" }] },
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState icon={Boxes} title="Aucune référence" description="Créez une référence ou importez votre catalogue (CSV)." action={can(ctx, "import:run") ? <Button asChild size="sm" variant="outline"><Link href="/imports">Importer un CSV</Link></Button> : undefined} />
      ) : (
        <>
          <DataTable
            caption="Catalogue"
            sort={query.sort}
            dir={query.dir}
            columns={[
              { id: "name", header: "Désignation", sortable: true },
              { id: "sku", header: "SKU", sortable: true, hideOnMobile: true },
              { id: "category", header: "Catégorie", hideOnMobile: true },
              { id: "location", header: "Rangement", hideOnMobile: true },
              { id: "available", header: "Dispo.", align: "right" },
              { id: "reserved", header: "Réservé", align: "right", hideOnMobile: true },
              { id: "out", header: "Sorti", align: "right", hideOnMobile: true },
              { id: "blocked", header: "Immobilisé", align: "right", hideOnMobile: true },
              { id: "total", header: "Total", align: "right" },
              { id: "price", header: "Loc./jour", align: "right", hideOnMobile: true },
            ]}
            rows={data.items.map((p) => ({
              id: p.id,
              href: `/inventory/${p.id}`,
              cells: {
                name: (
                  <span className="inline-flex items-center gap-2">
                    {p.name}
                    {p.lowStock ? <Badge tone="warning">Stock bas</Badge> : null}
                    {!p.stockManaged ? <Badge>Non suivi</Badge> : null}
                    {p.archived ? <Badge>Archivé</Badge> : null}
                  </span>
                ),
                sku: <span className="font-mono text-xs">{p.sku}</span>,
                category: (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: p.category.color }} aria-hidden />
                    {p.category.name}
                  </span>
                ),
                location: p.location ?? "—",
                available: p.stock ? <span className={p.lowStock ? "font-semibold text-warning" : "font-semibold text-success"}>{p.stock.availableNow}</span> : "—",
                reserved: p.stock?.reserved ?? "—",
                out: p.stock?.inTransit ?? "—",
                blocked: p.stock ? <span className={p.stock.damaged + p.stock.inMaintenance > 0 ? "text-destructive" : undefined}>{p.stock.damaged + p.stock.inMaintenance}</span> : "—",
                total: p.stock?.total ?? "—",
                price: formatMoney(p.rentalPrice),
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
