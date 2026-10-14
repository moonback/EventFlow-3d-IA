import { redirect } from "next/navigation";
import { PageHeader } from "@/components/feedback/page-header";
import { DocumentEditor } from "@/features/quotes/components/document-editor";
import { db } from "@/lib/db";
import { loadOr404, pageContext } from "@/server/auth/page";
import { customerOptions } from "@/server/services/customer-service";
import { eventOptions } from "@/server/services/event-service";
import { productOptions } from "@/server/services/inventory-service";
import { getQuote } from "@/server/services/quote-service";

export const metadata = { title: "Modifier le devis" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("quotes:write", "customers:read");
  const { id } = await params;
  const q = await loadOr404(() => getQuote(ctx, id));
  if (q.status !== "DRAFT") redirect(`/quotes/${id}`);
  const [customers, events, products, org] = await Promise.all([
    customerOptions(ctx),
    ctx.permissions.has("events:read") ? eventOptions(ctx, { includeClosed: true }) : [],
    ctx.permissions.has("inventory:read") ? productOptions(ctx) : [],
    db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { defaultVatRate: true } }),
  ]);
  return (
    <>
      <PageHeader title={`Modifier ${q.number}`} breadcrumbs={[{ label: "Devis", href: "/quotes" }, { label: q.number, href: `/quotes/${id}` }, { label: "Modifier" }]} />
      <DocumentEditor
        mode="quote"
        documentId={id}
        customers={customers}
        events={events}
        products={products}
        defaultVatRate={org.defaultVatRate.toString()}
        initial={{
          customerId: q.customerId,
          eventId: q.eventId ?? "",
          title: q.title,
          validUntil: q.validUntil ? q.validUntil.slice(0, 10) : "",
          globalDiscountPercent: q.globalDiscountPercent,
          notes: q.notes ?? "",
          terms: q.terms ?? "",
          lines: q.lines.map((l) => ({ kind: l.kind, productId: l.productId ?? "", description: l.description, quantity: l.quantity, days: l.days, unitPrice: l.unitPrice, discountPercent: l.discountPercent, vatRate: l.vatRate })),
        }}
      />
    </>
  );
}
