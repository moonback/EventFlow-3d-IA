import { redirect } from "next/navigation";
import { PageHeader } from "@/components/feedback/page-header";
import { ReservationForm } from "@/features/reservations/components/reservation-form";
import { loadOr404, pageContext } from "@/server/auth/page";
import { productOptions } from "@/server/services/inventory-service";
import { getReservation } from "@/server/services/reservation-service";

export const metadata = { title: "Modifier la réservation" };

export default async function EditReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("reservations:write");
  const { id } = await params;
  const r = await loadOr404(() => getReservation(ctx, id));
  if (!["DRAFT", "PENDING", "CONFIRMED"].includes(r.status)) redirect(`/reservations/${id}`);
  const products = await productOptions(ctx);
  return (
    <>
      <PageHeader
        title={`Modifier ${r.reference}`}
        description={r.status === "CONFIRMED" ? "Réservation confirmée : les nouvelles quantités et dates sont revérifiées sous verrou avant enregistrement." : undefined}
        breadcrumbs={[{ label: "Réservations", href: "/reservations" }, { label: r.reference, href: `/reservations/${id}` }, { label: "Modifier" }]}
      />
      <ReservationForm
        reservationId={id}
        events={[]}
        products={products}
        defaults={{ prepBufferHours: r.prepBufferHours, returnBufferHours: r.returnBufferHours, eventWindows: {} }}
        initial={{ eventId: r.event.id, startAt: r.startAt, endAt: r.endAt, prepBufferHours: r.prepBufferHours, returnBufferHours: r.returnBufferHours, notes: r.notes ?? "", lines: r.lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })) }}
      />
    </>
  );
}
