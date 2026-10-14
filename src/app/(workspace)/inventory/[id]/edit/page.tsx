import { PageHeader } from "@/components/feedback/page-header";
import { ProductForm } from "@/features/inventory/components/product-form";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getProduct, listCategories, locationOptions } from "@/server/services/inventory-service";
import { supplierOptions } from "@/server/services/supplier-service";

export const metadata = { title: "Modifier la référence" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("inventory:write", "stock:read");
  const { id } = await params;
  const [p, categories, suppliers, locations] = await Promise.all([loadOr404(() => getProduct(ctx, id)), listCategories(ctx), ctx.permissions.has("suppliers:read") ? supplierOptions(ctx) : [], locationOptions(ctx, ["WAREHOUSE", "ZONE", "RACK", "BIN"])]);
  return (
    <>
      <PageHeader title={`Modifier ${p.name}`} breadcrumbs={[{ label: "Catalogue", href: "/inventory" }, { label: p.sku, href: `/inventory/${id}` }, { label: "Modifier" }]} />
      <ProductForm
        productId={id}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        suppliers={suppliers}
        locations={locations}
        initial={{
          sku: p.sku, barcode: p.barcode ?? "", name: p.name, description: p.description ?? "", categoryId: p.categoryId, unit: p.unit, stockManaged: p.stockManaged, serialized: p.serialized,
          alertThreshold: p.alertThreshold, purchasePrice: p.purchasePrice ?? "", rentalPrice: p.rentalPrice ?? "", replacementValue: p.replacementValue ?? "", supplierId: p.supplierId ?? "",
          weightKg: p.weightKg ?? "", volumeM3: p.volumeM3 ?? "", lengthCm: p.lengthCm ?? "", widthCm: p.widthCm ?? "", heightCm: p.heightCm ?? "", defaultLocationId: p.defaultLocationId ?? "",
        }}
      />
    </>
  );
}
