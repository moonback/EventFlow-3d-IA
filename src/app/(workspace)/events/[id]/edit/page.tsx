import { PageHeader } from "@/components/feedback/page-header";
import { EventForm } from "@/features/events/components/event-form";
import { utcToZonedLocalInput } from "@/lib/dates";
import { loadOr404, pageContext } from "@/server/auth/page";
import { customerOptions } from "@/server/services/customer-service";
import { getEvent, listEventTypes } from "@/server/services/event-service";
import { memberUserOptions } from "@/server/services/settings-service";

export const metadata = { title: "Modifier l'événement" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("events:write", "customers:read");
  const { id } = await params;
  const [e, customers, types, managers] = await Promise.all([loadOr404(() => getEvent(ctx, id)), customerOptions(ctx), listEventTypes(ctx), memberUserOptions(ctx)]);
  const loc = (d: string | null) => (d ? utcToZonedLocalInput(d, e.timezone) : "");
  return (
    <>
      <PageHeader title={`Modifier ${e.reference}`} breadcrumbs={[{ label: "Événements", href: "/events" }, { label: e.reference, href: `/events/${id}` }, { label: "Modifier" }]} />
      <EventForm
        eventId={id}
        customers={customers}
        types={types.map((t) => ({ value: t.id, label: t.name }))}
        managers={managers}
        initial={{
          name: e.name,
          customerId: e.customerId,
          eventTypeId: e.eventTypeId ?? "",
          managerId: e.managerId ?? "",
          timezone: e.timezone,
          startLocal: loc(e.startAt),
          endLocal: loc(e.endAt),
          setupStartLocal: loc(e.setupStartAt),
          teardownEndLocal: loc(e.teardownEndAt),
          venueName: e.venueName ?? "",
          addressLine1: e.addressLine1 ?? "",
          postalCode: e.postalCode ?? "",
          city: e.city ?? "",
          country: e.country,
          guestCount: e.guestCount ?? "",
          budgetAmount: e.budgetAmount ?? "",
          estimatedCost: e.estimatedCost ?? "",
          description: e.description ?? "",
        }}
      />
    </>
  );
}
