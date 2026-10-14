import { PageHeader } from "@/components/feedback/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { pageContext } from "@/server/auth/page";
import { listEventTypes } from "@/server/services/event-service";
import { EventTypeForm } from "./event-type-form";

export const metadata = { title: "Types d'événement" };

export default async function EventTypesPage() {
  const ctx = await pageContext("settings:manage");
  const types = await listEventTypes(ctx);
  return (
    <>
      <PageHeader title="Types d'événement" breadcrumbs={[{ label: "Paramètres", href: "/settings" }, { label: "Types d'événement" }]} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="flex flex-wrap gap-2 pt-5">
            {types.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                <span className="size-3 rounded-full" style={{ background: t.color }} aria-hidden /> {t.name}
              </span>
            ))}
          </CardContent>
        </Card>
        <EventTypeForm />
      </div>
    </>
  );
}
