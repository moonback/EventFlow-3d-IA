import { PageHeader } from "@/components/feedback/page-header";
import { DocumentEditor } from "@/features/quotes/components/document-editor";
import { db } from "@/lib/db";
import { pageContext } from "@/server/auth/page";
import { customerOptions } from "@/server/services/customer-service";
import { eventOptions } from "@/server/services/event-service";
import { productOptions } from "@/server/services/inventory-service";

export const metadata = { title: "Nouvelle facture" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customerId?: string; eventId?: string }> }) {
  const ctx = await pageContext("invoices:write", "customers:read");
  const sp = await searchParams;
  const [customers, events, products, org] = await Promise.all([
    customerOptions(ctx),
    ctx.permissions.has("events:read") ? eventOptions(ctx, { includeClosed: true }) : [],
    ctx.permissions.has("inventory:read") ? productOptions(ctx) : [],
    db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { defaultVatRate: true } }),
  ]);
  return (
    <>
      <PageHeader title="Nouvelle facture (brouillon)" description="Le numéro définitif est attribué à l'émission." breadcrumbs={[{ label: "Factures", href: "/invoices" }, { label: "Nouvelle" }]} />
      <DocumentEditor mode="invoice" customers={customers} events={events} products={products} defaultVatRate={org.defaultVatRate.toString()} initial={{ customerId: sp.customerId ?? "", eventId: sp.eventId ?? "" }} />
    </>
  );
}
