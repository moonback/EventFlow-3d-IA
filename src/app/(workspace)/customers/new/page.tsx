import { PageHeader } from "@/components/feedback/page-header";
import { CustomerForm } from "@/features/customers/components/customer-form";
import { pageContext } from "@/server/auth/page";

export const metadata = { title: "Nouveau client" };

export default async function NewCustomerPage() {
  await pageContext("customers:write");
  return (
    <>
      <PageHeader title="Nouveau client" breadcrumbs={[{ label: "Clients", href: "/customers" }, { label: "Nouveau" }]} />
      <CustomerForm />
    </>
  );
}
