import { PageHeader } from "@/components/feedback/page-header";
import { PurchaseOrderForm } from "@/features/purchases/components/purchase-forms";
import { pageContext } from "@/server/auth/page";
import { productOptions } from "@/server/services/inventory-service";
import { supplierOptions } from "@/server/services/supplier-service";

export const metadata = { title: "Nouvelle commande" };

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ supplierId?: string }> }) {
  const ctx = await pageContext("purchases:write", "suppliers:read", "inventory:read");
  const sp = await searchParams;
  const [suppliers, products] = await Promise.all([supplierOptions(ctx), productOptions(ctx)]);
  return (
    <>
      <PageHeader title="Nouvelle commande fournisseur" breadcrumbs={[{ label: "Achats", href: "/purchases" }, { label: "Nouvelle" }]} />
      <PurchaseOrderForm suppliers={suppliers} products={products.filter((p) => p.stockManaged)} initial={{ supplierId: sp.supplierId ?? "", expectedAt: "", notes: "", lines: [{ productId: "", quantityOrdered: "1", unitCost: "0" }] }} />
    </>
  );
}
