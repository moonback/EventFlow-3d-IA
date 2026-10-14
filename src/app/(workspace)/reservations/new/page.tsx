import { PageHeader } from "@/components/feedback/page-header";
import { ReservationForm } from "@/features/reservations/components/reservation-form";
import { db } from "@/lib/db";
import { pageContext } from "@/server/auth/page";
import { eventOptions } from "@/server/services/event-service";
import { productOptions } from "@/server/services/inventory-service";

export const metadata = { title: "Nouvelle réservation" };

export default async function NewReservationPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const ctx = await pageContext("reservations:write", "events:read", "inventory:read");
  const { eventId } = await searchParams;
  const [events, products, org, windows] = await Promise.all([
    eventOptions(ctx),
    productOptions(ctx),
    db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { prepBufferHours: true, returnBufferHours: true } }),
    db.event.findMany({ where: { organizationId: ctx.organizationId, status: { notIn: ["CANCELLED", "COMPLETED"] } }, select: { id: true, startAt: true, endAt: true, setupStartAt: true, teardownEndAt: true } }),
  ]);
  const eventWindows = Object.fromEntries(windows.map((w) => [w.id, { start: (w.setupStartAt ?? w.startAt).toISOString(), end: (w.teardownEndAt ?? w.endAt).toISOString() }]));
  const initialEvent = eventId && eventWindows[eventId] ? eventId : undefined;
  return (
    <>
      <PageHeader title="Nouvelle réservation" description="Disponibilités calculées sur la période, tampons de préparation et de retour inclus." breadcrumbs={[{ label: "Réservations", href: "/reservations" }, { label: "Nouvelle" }]} />
      <ReservationForm
        events={events}
        products={products}
        defaults={{ prepBufferHours: org.prepBufferHours, returnBufferHours: org.returnBufferHours, eventWindows }}
        initial={
          initialEvent
            ? { eventId: initialEvent, startAt: eventWindows[initialEvent]!.start, endAt: eventWindows[initialEvent]!.end, prepBufferHours: org.prepBufferHours, returnBufferHours: org.returnBufferHours, notes: "", lines: [] }
            : undefined
        }
      />
    </>
  );
}
