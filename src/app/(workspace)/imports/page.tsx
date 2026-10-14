import { PageHeader } from "@/components/feedback/page-header";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Imports CSV" };

export default async function ImportsPage() {
  const ctx = await pageContext("import:run");
  return (
    <>
      <PageHeader title="Imports CSV" description="Aperçu, validation ligne à ligne et rapport d'erreurs avant toute modification. L'application est transactionnelle (tout ou rien) et nécessite votre confirmation." />
      <ImportWizard canProducts={can(ctx, "inventory:write")} canCustomers={can(ctx, "customers:write")} />
    </>
  );
}
