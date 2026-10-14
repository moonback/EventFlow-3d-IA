import { PageHeader } from "@/components/feedback/page-header";
import { SupplierForm } from "@/features/suppliers/components/supplier-form";
import { pageContext } from "@/server/auth/page";

export const metadata = { title: "Nouveau fournisseur" };

export default async function NewSupplierPage() {
  await pageContext("suppliers:write");
  return (
    <>
      <PageHeader title="Nouveau fournisseur" breadcrumbs={[{ label: "Fournisseurs", href: "/suppliers" }, { label: "Nouveau" }]} />
      <SupplierForm />
    </>
  );
}
