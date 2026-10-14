import { PageHeader } from "@/components/feedback/page-header";
import { EventForm } from "@/features/events/components/event-form";
import { pageContext } from "@/server/auth/page";
import { customerOptions } from "@/server/services/customer-service";
import { listEventTypes } from "@/server/services/event-service";
import { memberUserOptions } from "@/server/services/settings-service";

export const metadata = { title: "Nouvel événement" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const ctx = await pageContext("events:write", "customers:read");
  const { customerId } = await searchParams;
  const [customers, types, managers] = await Promise.all([customerOptions(ctx), listEventTypes(ctx), memberUserOptions(ctx)]);
  return (
    <>
      <PageHeader title="Nouvel événement" breadcrumbs={[{ label: "Événements", href: "/events" }, { label: "Nouveau" }]} />
      <EventForm customers={customers} types={types.map((t) => ({ value: t.id, label: t.name }))} managers={managers} initial={{ customerId: customerId ?? "", timezone: ctx.organization.timezone, managerId: ctx.userId }} />
    </>
  );
}
