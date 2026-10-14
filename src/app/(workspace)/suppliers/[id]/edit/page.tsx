import { PageHeader } from "@/components/feedback/page-header";
import { SupplierForm } from "@/features/suppliers/components/supplier-form";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getSupplier } from "@/server/services/supplier-service";

export const metadata = { title: "Modifier le fournisseur" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("suppliers:write");
  const { id } = await params;
  const s = await loadOr404(() => getSupplier(ctx, id));
  return (
    <>
      <PageHeader title={`Modifier ${s.name}`} breadcrumbs={[{ label: "Fournisseurs", href: "/suppliers" }, { label: s.name, href: `/suppliers/${id}` }, { label: "Modifier" }]} />
      <SupplierForm supplierId={id} initial={{ name: s.name, email: s.email ?? "", phone: s.phone ?? "", website: s.website ?? "", addressLine1: s.addressLine1 ?? "", postalCode: s.postalCode ?? "", city: s.city ?? "", country: s.country, siret: s.siret ?? "", vatNumber: s.vatNumber ?? "", notes: s.notes ?? "" }} />
    </>
  );
}
