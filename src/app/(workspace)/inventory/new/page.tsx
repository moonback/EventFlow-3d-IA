import { PageHeader } from "@/components/feedback/page-header";
import { ProductForm } from "@/features/inventory/components/product-form";
import { pageContext } from "@/server/auth/page";
import { listCategories, locationOptions } from "@/server/services/inventory-service";
import { supplierOptions } from "@/server/services/supplier-service";

export const metadata = { title: "Nouvelle référence" };

export default async function NewProductPage() {
  const ctx = await pageContext("inventory:write", "stock:read");
  const [categories, suppliers, locations] = await Promise.all([listCategories(ctx), ctx.permissions.has("suppliers:read") ? supplierOptions(ctx) : [], locationOptions(ctx, ["WAREHOUSE", "ZONE", "RACK", "BIN"])]);
  return (
    <>
      <PageHeader title="Nouvelle référence" breadcrumbs={[{ label: "Catalogue", href: "/inventory" }, { label: "Nouvelle" }]} />
      <ProductForm categories={categories.map((c) => ({ value: c.id, label: c.name }))} suppliers={suppliers} locations={locations} />
    </>
  );
}
