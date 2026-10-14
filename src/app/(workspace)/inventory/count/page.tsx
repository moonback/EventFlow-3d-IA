import { PageHeader } from "@/components/feedback/page-header";
import { StockCountForm } from "@/features/inventory/components/stock-count-form";
import { firstParam } from "@/lib/pagination";
import { pageContext } from "@/server/auth/page";
import { getLocation, locationOptions, productOptions } from "@/server/services/inventory-service";

export const metadata = { title: "Inventaire" };

export default async function CountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("stock:write");
  const sp = await searchParams;
  const locationId = firstParam(sp.locationId) ?? null;
  const [locations, products, location] = await Promise.all([
    locationOptions(ctx, ["WAREHOUSE", "ZONE", "RACK", "BIN", "RETURN", "QUARANTINE", "MAINTENANCE", "PREPARATION"]),
    productOptions(ctx),
    locationId ? getLocation(ctx, locationId).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader title="Inventaire par emplacement" description="Comptez physiquement, saisissez les quantités : les écarts deviennent des ajustements justifiés et tracés." breadcrumbs={[{ label: "Catalogue", href: "/inventory" }, { label: "Inventaire" }]} />
      <StockCountForm
        key={locationId ?? "none"}
        locations={locations}
        locationId={location ? location.id : null}
        rows={location ? location.balances.map((b) => ({ productId: b.product.id, sku: b.product.sku, name: b.product.name, expected: b.quantity })) : []}
        products={products.filter((p) => p.stockManaged).map((p) => ({ value: p.value, label: p.label, sku: p.sku, name: p.name }))}
      />
    </>
  );
}
