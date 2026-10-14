import { TZDate } from "@date-fns/tz";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/feedback/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTime } from "@/lib/dates";
import { eventStatusLabels } from "@/lib/labels";
import { firstParam } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { calendarEvents } from "@/server/services/event-service";
import { staffSchedule } from "@/server/services/staff-service";
import { vehicleSchedule } from "@/server/services/vehicle-service";

export const metadata = { title: "Planning" };

const DAY = 86_400_000;
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function Tabs({ view }: { view: string }) {
  const tabs = [
    ["events", "Calendrier des événements"],
    ["vehicles", "Véhicules"],
    ["staff", "Équipes"],
  ];
  return (
    <div className="mb-4 inline-flex rounded-lg bg-muted p-1 text-sm" role="tablist">
      {tabs.map(([k, label]) => (
        <Link key={k} href={`/planning?view=${k}`} role="tab" aria-selected={view === k} className={cn("rounded-md px-3 py-1", view === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {label}
        </Link>
      ))}
    </div>
  );
}

/** Frise sur 14 jours (Gantt simplifié) — les éléments en conflit sont signalés. */
function Timeline({ rows, from, days, tz }: { rows: { id: string; name: string; sub?: string | null; href: string; items: { id: string; label: string; start: string; end: string; kind: string; href?: string | null; conflict?: boolean }[] }[]; from: Date; days: number; tz: string }) {
  const total = days * DAY;
  const pct = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - from.getTime()) / total) * 100));
  const colors: Record<string, string> = { assignment: "bg-primary/80", proposal: "border border-dashed border-primary bg-primary/40", driving: "bg-info/80", unavailable: "bg-muted-foreground/40", available: "bg-success/60", maintenance: "bg-warning/80", mission: "bg-primary/80" };
  return (
    <Card className="overflow-x-auto">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[200px_1fr] border-b border-border text-xs text-muted-foreground">
          <div className="p-2">Ressource</div>
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
            {Array.from({ length: days }).map((_, i) => {
              const d = new Date(from.getTime() + i * DAY);
              return (
                <div key={i} className="border-l border-border p-2 text-center">
                  {new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "short", day: "numeric" }).format(d)}
                </div>
              );
            })}
          </div>
        </div>
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[200px_1fr] border-b border-border last:border-0">
            <div className="p-2 text-sm">
              <Link href={r.href} className="font-medium hover:underline">
                {r.name}
              </Link>
              {r.sub ? <p className="truncate text-xs text-muted-foreground">{r.sub}</p> : null}
            </div>
            <div className="relative h-14 border-l border-border" style={{ backgroundImage: `repeating-linear-gradient(to right, transparent, transparent calc(100%/${days} - 1px), var(--color-border) calc(100%/${days} - 1px), var(--color-border) calc(100%/${days}))` }}>
              {r.items.map((it, idx) => {
                const left = pct(new Date(it.start));
                const width = Math.max(1.2, pct(new Date(it.end)) - left);
                const content = (
                  <span className={cn("absolute flex h-6 items-center truncate rounded px-1.5 text-[11px] text-white", colors[it.kind] ?? "bg-primary/80", it.conflict && "ring-2 ring-destructive")} style={{ left: `${left}%`, width: `${width}%`, top: 4 + (idx % 2) * 24 }} title={`${it.label} — ${formatTime(it.start, tz)} → ${formatTime(it.end, tz)}`}>
                    {it.conflict ? "⚠ " : ""}
                    {it.label}
                  </span>
                );
                return it.href ? (
                  <Link key={it.id} href={it.href}>
                    {content}
                  </Link>
                ) : (
                  <span key={it.id}>{content}</span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default async function PlanningPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("events:read");
  const sp = await searchParams;
  const view = firstParam(sp.view) ?? "events";
  const tz = ctx.organization.timezone;
  const now = new TZDate(Date.now(), tz);

  if (view === "vehicles" || view === "staff") {
    const offset = Number(firstParam(sp.offset) ?? "0") || 0;
    const start = new TZDate(now.getFullYear(), now.getMonth(), now.getDate() + offset - 1, 0, 0, 0, tz);
    const from = new Date(start.getTime());
    const days = 14;
    const to = new Date(from.getTime() + days * DAY);
    const rows =
      view === "vehicles" && can(ctx, "vehicles:read")
        ? (await vehicleSchedule(ctx, from, to)).map((v) => ({
            id: v.id,
            name: v.registration,
            sub: `${v.brand} ${v.model}`,
            href: `/vehicles/${v.id}`,
            items: [
              ...v.assignments.map((a) => ({ id: a.id, label: a.event.reference, start: a.startAt, end: a.endAt, kind: "mission", href: `/events/${a.event.id}` })),
              ...v.maintenances.map((m) => ({ id: m.id, label: m.title, start: m.startAt, end: m.endAt, kind: "maintenance", href: null })),
            ],
          }))
        : view === "staff" && can(ctx, "staff:read")
          ? (await staffSchedule(ctx, from, to)).map((s) => ({ id: s.id, name: s.name, sub: s.jobTitle, href: `/team/${s.id}`, items: s.items.map((it) => ({ ...it, href: it.eventId ? `/events/${it.eventId}` : null })) }))
          : [];
    return (
      <>
        <PageHeader
          title="Planning"
          description={view === "vehicles" ? "Missions et entretiens des véhicules (14 jours)" : "Affectations, conduites et indisponibilités (14 jours) — ⚠ = conflit"}
          actions={
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="outline" asChild>
                <Link href={`/planning?view=${view}&offset=${offset - 7}`} aria-label="Semaine précédente">
                  <ChevronLeft />
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/planning?view=${view}`}>Aujourd&apos;hui</Link>
              </Button>
              <Button size="icon-sm" variant="outline" asChild>
                <Link href={`/planning?view=${view}&offset=${offset + 7}`} aria-label="Semaine suivante">
                  <ChevronRight />
                </Link>
              </Button>
            </div>
          }
        />
        <Tabs view={view} />
        {rows.length ? <Timeline rows={rows} from={from} days={days} tz={tz} /> : <p className="text-sm text-muted-foreground">Aucune donnée accessible.</p>}
      </>
    );
  }

  // Vue mois des événements
  const month = firstParam(sp.month);
  const [y, m] = month && /^\d{4}-\d{2}$/.test(month) ? month.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const first = new TZDate(y!, m! - 1, 1, 0, 0, 0, tz);
  const startWeekday = (first.getDay() + 6) % 7;
  const gridStart = new TZDate(y!, m! - 1, 1 - startWeekday, 0, 0, 0, tz);
  const cells = Array.from({ length: 42 }, (_, i) => new TZDate(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i, 0, 0, 0, tz));
  const events = await calendarEvents(ctx, new Date(cells[0]!.getTime()), new Date(cells[41]!.getTime() + DAY));
  const prev = new TZDate(y!, m! - 2, 1, tz);
  const next = new TZDate(y!, m!, 1, tz);
  const key = (d: TZDate) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  return (
    <>
      <PageHeader
        title="Planning"
        description={new Intl.DateTimeFormat("fr-FR", { timeZone: tz, month: "long", year: "numeric" }).format(first)}
        actions={
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" asChild>
              <Link href={`/planning?month=${key(prev)}`} aria-label="Mois précédent">
                <ChevronLeft />
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/planning">Aujourd&apos;hui</Link>
            </Button>
            <Button size="icon-sm" variant="outline" asChild>
              <Link href={`/planning?month=${key(next)}`} aria-label="Mois suivant">
                <ChevronRight />
              </Link>
            </Button>
          </div>
        }
      />
      <Tabs view="events" />
      <Card className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 border-b border-border text-xs text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="p-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid min-w-[760px] grid-cols-7">
          {cells.map((c, i) => {
            const dayStart = c.getTime();
            const dayEnd = dayStart + DAY;
            const dayEvents = events.filter((e) => new Date(e.startAt).getTime() < dayEnd && new Date(e.endAt).getTime() > dayStart);
            const inMonth = c.getMonth() === m! - 1;
            const isToday = `${c.getFullYear()}-${c.getMonth()}-${c.getDate()}` === todayKey;
            return (
              <div key={i} className={cn("min-h-28 border-r border-b border-border p-1.5", !inMonth && "bg-muted/30", (i + 1) % 7 === 0 && "border-r-0")}>
                <p className={cn("mb-1 text-right text-xs", !inMonth && "text-muted-foreground", isToday && "font-bold text-primary")}>{c.getDate()}</p>
                <ul className="flex flex-col gap-1">
                  {dayEvents.slice(0, 4).map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/events/${e.id}`}
                        className={cn("block truncate rounded px-1.5 py-0.5 text-[11px] text-white hover:opacity-90", e.status === "CANCELLED" && "line-through opacity-50")}
                        style={{ background: e.eventType?.color ?? "var(--color-primary)" }}
                        title={`${e.name} — ${e.customer.name} — ${eventStatusLabels[e.status]}`}
                      >
                        {new Date(e.startAt).getTime() >= dayStart ? `${formatTime(e.startAt, e.timezone)} ` : "↳ "}
                        {e.name}
                      </Link>
                    </li>
                  ))}
                  {dayEvents.length > 4 ? <Badge className="self-start">+{dayEvents.length - 4}</Badge> : null}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
