import { redirect } from "next/navigation";
import { PageHeader } from "@/components/feedback/page-header";
import { DocumentEditor } from "@/features/quotes/components/document-editor";
import { db } from "@/lib/db";
import { loadOr404, pageContext } from "@/server/auth/page";
import { customerOptions } from "@/server/services/customer-service";
import { eventOptions } from "@/server/services/event-service";
import { productOptions } from "@/server/services/inventory-service";
import { getInvoice } from "@/server/services/invoice-service";

export const metadata = { title: "Modifier la facture" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("invoices:write", "customers:read");
  const { id } = await params;
  const i = await loadOr404(() => getInvoice(ctx, id));
  if (i.status !== "DRAFT") redirect(`/invoices/${id}`);
  const [customers, events, products, org] = await Promise.all([
    customerOptions(ctx),
    ctx.permissions.has("events:read") ? eventOptions(ctx, { includeClosed: true }) : [],
    ctx.permissions.has("inventory:read") ? productOptions(ctx) : [],
    db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { defaultVatRate: true } }),
  ]);
  return (
    <>
      <PageHeader title={`Modifier le brouillon${i.kind === "CREDIT_NOTE" ? " d'avoir" : ""}`} breadcrumbs={[{ label: "Factures", href: "/invoices" }, { label: "Brouillon", href: `/invoices/${id}` }, { label: "Modifier" }]} />
      <DocumentEditor
        mode="invoice"
        documentId={id}
        customers={customers}
        events={events}
        products={products}
        defaultVatRate={org.defaultVatRate.toString()}
        initial={{
          customerId: i.customerId,
          eventId: i.eventId ?? "",
          title: i.title,
          globalDiscountPercent: i.globalDiscountPercent,
          notes: i.notes ?? "",
          lines: i.lines.map((l) => ({ kind: l.kind, productId: l.productId ?? "", description: l.description, quantity: l.quantity, days: l.days, unitPrice: l.unitPrice, discountPercent: l.discountPercent, vatRate: l.vatRate })),
        }}
      />
    </>
  );
}
