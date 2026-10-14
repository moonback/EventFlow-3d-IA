import { PageHeader } from "@/components/feedback/page-header";
import { CustomerForm } from "@/features/customers/components/customer-form";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getCustomer } from "@/server/services/customer-service";

export const metadata = { title: "Modifier le client" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("customers:write");
  const { id } = await params;
  const c = await loadOr404(() => getCustomer(ctx, id));
  return (
    <>
      <PageHeader title={`Modifier ${c.name}`} breadcrumbs={[{ label: "Clients", href: "/customers" }, { label: c.name, href: `/customers/${id}` }, { label: "Modifier" }]} />
      <CustomerForm
        customerId={id}
        initial={{ kind: c.kind, name: c.kind === "COMPANY" ? c.name : "", firstName: c.firstName ?? "", lastName: c.lastName ?? "", email: c.email ?? "", phone: c.phone ?? "", siret: c.siret ?? "", vatNumber: c.vatNumber ?? "", notes: c.notes ?? "" }}
      />
    </>
  );
}
