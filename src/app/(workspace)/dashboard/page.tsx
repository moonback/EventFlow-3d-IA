import { AlertTriangle, ArrowRight, Box, Boxes, CalendarCheck, CalendarClock, CheckCircle2, ClipboardCheck, FilePlus2, FileText, PackageCheck, PackageOpen, Receipt, Truck, Undo2, UserPlus, Users, Wallet, ShoppingCart, ListTodo, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MonthlyFinanceChart, Sparkline } from "@/components/charts/charts";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { eventStatusLabels, eventStatusTones, reservationStatusLabels, reservationStatusTones } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { DASHBOARD_WIDGETS, getDashboard } from "@/server/services/dashboard-service";
import { monthlySeries } from "@/server/services/finance-service";
import { locationOptions } from "@/server/services/inventory-service";
import { SiteHero } from "@/three/ui/site-hero";
import { CustomizeDashboard } from "./customize-dialog";

export const metadata = { title: "Tableau de bord" };

function Panel({ title, href, children, icon: Icon, linkLabel = "Voir tout", compact = false }: { title: string; href?: string; children: ReactNode; icon?: typeof CalendarClock; linkLabel?: string; compact?: boolean }) {
  return (
    <Card className="flex min-w-0 flex-col rounded-2xl">
      <CardHeader className={cn("flex-row items-center justify-between gap-2 space-y-0", compact ? "p-4 pb-3" : "pb-4")}>
        <CardTitle className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden /> : null}
          {title}
        </CardTitle>
        {href ? (
          <Link href={href} className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-blue-400 hover:text-blue-300">
            {linkLabel} <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className={cn("flex-1", compact && "p-4 pt-0")}>{children}</CardContent>
    </Card>
  );
}

const ACTION_LABELS: Record<string, string> = {
  "reservation.confirmed": "a confirmé une réservation",
  "reservation.created": "a créé une réservation",
  "reservation.prepared": "a préparé du matériel",
  "reservation.shipped": "a expédié une réservation",
  "reservation.returned": "a enregistré un retour",
  "reservation.cancelled": "a annulé une réservation",
  "quote.created": "a créé un devis",
  "quote.issued": "a émis un devis",
  "quote.accepted": "a enregistré l'acceptation d'un devis",
  "invoice.issued": "a émis une facture",
  "payment.recorded": "a enregistré un paiement",
  "event.created": "a créé un événement",
  "event.status_changed": "a changé le statut d'un événement",
  "customer.created": "a créé un client",
  "stock.receipt": "a réceptionné du matériel",
  "vehicle.assigned": "a affecté un véhicule",
  "staff.assigned": "a affecté un collaborateur",
};

const ACTIVITY_TITLES: Record<string, string> = {
  "reservation.created": "Réservation créée",
  "reservation.confirmed": "Réservation confirmée",
  "reservation.prepared": "Matériel préparé",
  "reservation.shipped": "Réservation expédiée",
  "reservation.returned": "Retour matériel",
  "reservation.cancelled": "Réservation annulée",
  "stock.receipt": "Stock mis à jour",
  "stock.transfer": "Transfert de stock",
  "quote.created": "Devis créé",
  "quote.issued": "Devis émis",
  "quote.accepted": "Devis accepté",
  "quote.declined": "Devis refusé",
  "invoice.draft_created": "Facture en préparation",
  "invoice.issued": "Facture émise",
  "payment.recorded": "Facture payée",
  "event.created": "Événement créé",
  "event.status_changed": "Statut d'événement modifié",
  "customer.created": "Nouveau client",
  "customer.address_added": "Adresse client ajoutée",
  "customer.contact_added": "Contact client ajouté",
  "staff.assigned": "Collaborateur affecté",
  "staff.timesheet_added": "Temps saisi",
  "vehicle.assigned": "Véhicule affecté",
  "task.created": "Tâche créée",
  "expense.created": "Dépense enregistrée",
  "purchase.created": "Commande fournisseur créée",
  "purchase.ordered": "Commande fournisseur passée",
  "purchase.received": "Commande réceptionnée",
  "stock.count": "Inventaire réalisé",
  "scene.placement_saved": "Agencement 3D modifié",
  "scene.layout_saved": "Agencement 3D enregistré",
  "scene.layout_restored": "Agencement 3D restauré",
  "scene.bookmark_created": "Point de vue 3D enregistré",
  "scene.bookmark_deleted": "Point de vue 3D supprimé",
};

const ACTIVITY_STYLES: { prefix: string; icon: LucideIcon; className: string }[] = [
  { prefix: "reservation.returned", icon: Undo2, className: "bg-orange-500/15 text-orange-400" },
  { prefix: "reservation", icon: PackageCheck, className: "bg-emerald-500/15 text-emerald-400" },
  { prefix: "stock", icon: Boxes, className: "bg-blue-500/15 text-blue-400" },
  { prefix: "quote", icon: FilePlus2, className: "bg-violet-500/15 text-violet-400" },
  { prefix: "invoice", icon: Receipt, className: "bg-emerald-500/15 text-emerald-400" },
  { prefix: "payment", icon: Wallet, className: "bg-emerald-500/15 text-emerald-400" },
  { prefix: "event", icon: CalendarCheck, className: "bg-indigo-500/15 text-indigo-400" },
  { prefix: "customer", icon: UserPlus, className: "bg-sky-500/15 text-sky-400" },
  { prefix: "vehicle", icon: Truck, className: "bg-amber-500/15 text-amber-400" },
  { prefix: "expense", icon: Wallet, className: "bg-rose-500/15 text-rose-400" },
  { prefix: "purchase", icon: ShoppingCart, className: "bg-cyan-500/15 text-cyan-400" },
  { prefix: "task", icon: ListTodo, className: "bg-amber-500/15 text-amber-400" },
  { prefix: "scene", icon: Box, className: "bg-indigo-500/15 text-indigo-400" },
  { prefix: "staff", icon: Users, className: "bg-pink-500/15 text-pink-400" },
];
const activityStyle = (action: string) => ACTIVITY_STYLES.find((s) => action.startsWith(s.prefix)) ?? { icon: CheckCircle2, className: "bg-muted text-muted-foreground" };

const ENTITY_LABELS: Record<string, string> = {
  Reservation: "Réservation",
  Quote: "Devis",
  Invoice: "Facture",
  Payment: "Paiement",
  Event: "Événement",
  Customer: "Client",
  Vehicle: "Véhicule",
  StockMovement: "Mouvement de stock",
  StaffAssignment: "Affectation",
};

function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

const pctDelta = (current: number, previous: number) => (previous ? Math.round(((current - previous) / Math.abs(previous)) * 100) : null);

function Kpi({ label, value, delta, deltaSuffix = "%", values, color }: { label: string; value: string; delta: number | null; deltaSuffix?: string; values?: number[]; color: string }) {
  return (
    <div className="border-b border-border/60 py-2 first:pt-0 last:border-0">
      <p className="text-xs" style={{ color }}>
        {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-lg font-semibold whitespace-nowrap tabular-nums">{value}</p>
        <div className="flex shrink-0 items-end gap-1.5">
          {delta !== null ? <span className={cn("pb-0.5 text-[11px] font-medium whitespace-nowrap tabular-nums", delta >= 0 ? "text-success" : "text-destructive")}>{`${delta >= 0 ? "+" : ""}${delta.toLocaleString("fr-FR")}${deltaSuffix}`}</span> : null}
          {values && values.length > 1 ? <Sparkline values={values} color={color} label={`Évolution : ${label}`} /> : null}
        </div>
      </div>
    </div>
  );
}

function MiniCalendar({ year, month, today, eventDays }: { year: number; month: number; today: string; eventDays: string[] }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // lundi = 0
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array.from({ length: offset }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const marked = new Set(eventDays);
  const title = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  return (
    <div>
      <p className="mb-3 text-center text-sm font-medium capitalize">{title}</p>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <span key={i} className="pb-1 text-muted-foreground">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />;
          const iso = `${year}-${pad(month)}-${pad(day)}`;
          const isToday = iso === today;
          return (
            <span key={iso} className="flex flex-col items-center">
              <span className={cn("flex size-7 items-center justify-center rounded-lg tabular-nums", isToday ? "bg-blue-600 font-semibold text-white" : "text-foreground/90")}>{day}</span>
              <span className={cn("mt-0.5 size-1 rounded-full", marked.has(iso) ? "bg-orange-400" : "bg-transparent")} aria-hidden />
              {marked.has(iso) ? <span className="sr-only">(événement)</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const ctx = await pageContext("dashboard:read");
  const tz = ctx.organization.timezone;
  const [d, monthly, locations] = await Promise.all([
    getDashboard(ctx),
    can(ctx, "finance:read") ? monthlySeries(ctx) : Promise.resolve(null),
    can(ctx, "stock:write") ? locationOptions(ctx, ["WAREHOUSE", "ZONE", "RACK", "BIN"]) : Promise.resolve([]),
  ]);
  const show = (w: string) => d.widgets.includes(w as (typeof DASHBOARD_WIDGETS)[number]);
  const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, day: "2-digit" });
  const monthFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, month: "short" });

  // Indicateurs clés du mois en cours (6 derniers mois pour les courbes)
  const last6 = monthly?.slice(-6) ?? [];
  const revenue = last6.map((m) => Number(m.invoiced));
  const margins = last6.map((m) => (Number(m.invoiced) ? Math.round(((Number(m.invoiced) - Number(m.expenses)) / Number(m.invoiced)) * 1000) / 10 : 0));
  const eventsCount = d.eventsSeries.map((m) => m.count);
  const at = (arr: number[], back: number) => arr[arr.length - 1 - back] ?? 0;

  const blocks: Record<string, ReactNode> = {
    upcomingEvents: can(ctx, "events:read") ? (
      <Panel compact key="upcomingEvents" title="Événements à venir" href="/events">
        {d.upcomingEvents.length === 0 ? (
          <EmptyState title="Aucun événement dans les 30 prochains jours" action={can(ctx, "events:write") ? <Button asChild size="sm"><Link href="/events/new">Créer un événement</Link></Button> : undefined} />
        ) : (
          <ul className="flex flex-col gap-2">
            {d.upcomingEvents.slice(0, 4).map((e) => (
              <li key={e.id} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/40 p-2">
                <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-muted leading-none">
                  <span className="text-base font-semibold tabular-nums">{dayFmt.format(new Date(e.startAt))}</span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground uppercase">{monthFmt.format(new Date(e.startAt)).replace(".", "")}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/events/${e.id}`} className="block truncate text-sm font-medium hover:underline" title={e.name}>
                    {e.name}
                  </Link>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs text-muted-foreground">
                      {e.customer.name}
                      {e.city ? ` · ${e.city}` : ""}
                    </p>
                    <span className="shrink-0 [&>span]:px-1.5 [&>span]:py-0 [&>span]:text-[10px]">
                      <StatusBadge value={e.status} labels={eventStatusLabels} tones={eventStatusTones} />
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ) : null,
    preparations: can(ctx, "reservations:read") ? (
      <Panel key="preparations" title="Préparations (48 h)" href="/logistics" icon={ClipboardCheck}>
        {d.preparations.length === 0 ? (
          <EmptyState title="Aucune préparation à venir" />
        ) : (
          <ul className="flex flex-col gap-3">
            {d.preparations.map((r) => (
              <li key={r.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/reservations/${r.id}`} className="truncate font-medium hover:underline">
                    {r.reference} · {r.eventName}
                  </Link>
                  <StatusBadge value={r.status} labels={reservationStatusLabels} tones={reservationStatusTones} />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={r.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Préparation ${r.reference}`}>
                    <div className={`h-full rounded-full ${r.progress === 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${r.progress}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{r.progress} %</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">Départ {formatDateTime(r.departure, r.timezone)}{r.late ? " · en retard" : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ) : null,
    returns: can(ctx, "reservations:read") ? (
      <Panel key="returns" title="Retours attendus" href="/logistics" icon={Undo2}>
        {d.returns.length === 0 ? (
          <EmptyState title="Aucun retour attendu" />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {d.returns.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/reservations/${r.id}`} className="block truncate font-medium hover:underline">
                    {r.reference} · {r.eventName}
                  </Link>
                  <p className="text-xs text-muted-foreground">Prévu {formatDateTime(r.expectedAt, r.timezone)}</p>
                </div>
                {r.late ? <Badge tone="danger">En retard</Badge> : <StatusBadge value={r.status} labels={reservationStatusLabels} tones={reservationStatusTones} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ) : null,
    tasks: can(ctx, "events:read") ? (
      <Panel compact key="tasks" title="Tâches urgentes" href="/events/tasks">
        {d.tasks.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Aucune tâche en retard ou due aujourd'hui" />
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {d.tasks.slice(0, 5).map((t) => {
              const urgent = t.overdue || t.priority === "URGENT" || t.priority === "HIGH";
              return (
                <li key={t.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className={cn("mt-0.5 size-4 shrink-0 rounded-full border-2", urgent ? "border-destructive" : "border-warning")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {t.title}
                      {t.event ? (
                        <Link href={`/events/${t.event.id}`} className="ml-1 text-xs font-normal text-muted-foreground hover:underline">
                          – {t.event.reference}
                        </Link>
                      ) : null}
                    </p>
                    <p className={cn("text-xs", t.overdue ? "text-destructive" : "text-muted-foreground")}>{t.overdue ? `En retard · ${formatDate(t.dueAt, tz)}` : `Aujourd'hui · ${formatTime(t.dueAt, tz)}`}</p>
                  </div>
                  <AlertTriangle className={cn("size-4 shrink-0", urgent ? "text-destructive" : "text-warning")} aria-label={urgent ? "Prioritaire" : "À surveiller"} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    ) : null,
    stockAlerts: d.stockAlerts ? (
      <Panel key="stockAlerts" title="Alertes matériel" href="/inventory?lowStock=true" icon={PackageOpen}>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Link href="/maintenance" className="rounded-lg border border-border p-3 hover:border-primary/40">
            <p className="text-xs text-muted-foreground">Unités immobilisées</p>
            <p className="text-xl font-semibold tabular-nums">{d.stockAlerts.quarantineUnits}</p>
          </Link>
          <Link href="/maintenance" className="rounded-lg border border-border p-3 hover:border-primary/40">
            <p className="text-xs text-muted-foreground">Tickets maintenance</p>
            <p className="text-xl font-semibold tabular-nums">{d.stockAlerts.openTickets}</p>
          </Link>
        </div>
        {d.stockAlerts.lowStock.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune référence sous son seuil d&apos;alerte.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {d.stockAlerts.lowStock.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/inventory/${p.id}`} className="truncate hover:underline">
                  {p.name}
                </Link>
                <Badge tone={p.available === 0 ? "danger" : "warning"}>
                  {p.available} / seuil {p.threshold}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ) : null,
    vehicles: d.vehicles ? (
      <Panel key="vehicles" title="Véhicules" href="/vehicles" icon={Truck}>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["En mission", d.vehicles.onMission, "text-info"],
            ["Affectés (7 j)", d.vehicles.assigned, "text-primary"],
            ["Disponibles", d.vehicles.available, "text-success"],
            ["Maintenance / indispo.", d.vehicles.maintenance, "text-warning"],
          ].map(([label, value, cls]) => (
            <div key={label as string} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-xl font-semibold tabular-nums ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      </Panel>
    ) : null,
    quotes: d.quotes ? (
      <Panel key="quotes" title="Devis en attente" href="/quotes?status=SENT" icon={FileText}>
        <p className="mb-3 text-sm text-muted-foreground">
          {d.quotes.pendingCount} devis envoyés · {formatMoney(d.quotes.pendingAmount)} HT · <span className={d.quotes.followUps ? "text-warning" : ""}>{d.quotes.followUps} à relancer</span>
        </p>
        <ul className="flex flex-col divide-y divide-border">
          {d.quotes.items.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <Link href={`/quotes/${q.id}`} className="min-w-0 truncate hover:underline">
                {q.number} · {q.customer.name}
              </Link>
              <span className="flex items-center gap-2">
                {q.needsFollowUp ? <Badge tone="warning">À relancer</Badge> : null}
                <span className="tabular-nums">{formatMoney(q.totalExclTax)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    ) : null,
    invoices: d.invoices ? (
      <Panel key="invoices" title="Factures impayées" href="/invoices?overdue=true" icon={Receipt}>
        <p className="mb-3 text-sm text-muted-foreground">
          {d.invoices.unpaidCount} factures ouvertes · {formatMoney(d.invoices.unpaidAmount)} TTC
          {d.invoices.overdueCount ? <span className="text-destructive"> · {d.invoices.overdueCount} en retard ({formatMoney(d.invoices.overdueAmount)})</span> : null}
        </p>
        {d.invoices.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune facture en retard.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {d.invoices.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/invoices/${i.id}`} className="min-w-0 truncate hover:underline">
                  {i.number} · {i.customer}
                </Link>
                <span className="text-right">
                  <span className="block tabular-nums">{formatMoney(i.balanceDue)}</span>
                  <span className="block text-xs text-destructive">échue le {formatDate(i.dueDate, tz)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ) : null,
    activity: (
      <Panel compact key="activity" title="Activité récente" href={can(ctx, "audit:read") ? "/settings/audit" : undefined}>
        {d.activity.length === 0 ? (
          <EmptyState title="Aucune activité récente" />
        ) : (
          <ul className="flex flex-col gap-3">
            {d.activity.slice(0, 5).map((a) => {
              const style = activityStyle(a.action);
              return (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", style.className)}>
                    <style.icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={`${a.actor} ${ACTION_LABELS[a.action] ?? a.action}`}>
                      {ACTIVITY_TITLES[a.action] ?? ENTITY_LABELS[a.entityType] ?? a.action}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{a.actor}</p>
                  </div>
                  <time dateTime={a.createdAt} title={formatDateTime(a.createdAt, tz)} className="shrink-0 text-[11px] text-muted-foreground">
                    {relativeTime(a.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    ),
    kpis: (
      <Panel compact key="kpis" title="Indicateurs clés" href={monthly ? "/finance" : undefined} linkLabel="Ce mois-ci">
        <div className="flex flex-col">
          {monthly ? (
            <>
              <Kpi label="Chiffre d'affaires" value={new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(at(revenue, 0))} delta={pctDelta(at(revenue, 0), at(revenue, 1))} values={revenue} color="#34d399" />
              <Kpi label="Marge" value={`${at(margins, 0).toLocaleString("fr-FR")} %`} delta={Math.round((at(margins, 0) - at(margins, 1)) * 10) / 10} deltaSuffix=" pt" values={margins} color="#a78bfa" />
            </>
          ) : null}
          {can(ctx, "events:read") ? <Kpi label="Événements" value={String(at(eventsCount, 0))} delta={at(eventsCount, 0) - at(eventsCount, 1)} deltaSuffix="" values={eventsCount} color="#60a5fa" /> : null}
          {d.stockUsage !== null ? (
            <div className="pt-2">
              <p className="text-xs text-orange-400">Taux d&apos;utilisation du stock</p>
              <div className="mt-1 flex items-center gap-3">
                <p className="text-lg font-semibold whitespace-nowrap tabular-nums">{d.stockUsage} %</p>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={d.stockUsage} aria-valuemin={0} aria-valuemax={100} aria-label="Taux d'utilisation du stock">
                  <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${d.stockUsage}%` }} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Panel>
    ),
    calendar: can(ctx, "events:read") ? (
      <Panel compact key="calendar" title="Calendrier" href="/planning">
        <MiniCalendar {...d.calendar} />
      </Panel>
    ) : null,
  };

  const TOP_ROW = ["upcomingEvents", "tasks", "kpis", "calendar", "activity"] as const;
  const topRow = TOP_ROW.filter((w) => w === "calendar" ? show("upcomingEvents") : show(w)).map((w) => blocks[w]).filter(Boolean);
  const others = d.widgets.filter((w) => !(TOP_ROW as readonly string[]).includes(w)).map((w) => blocks[w]).filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Accueil · {ctx.organization.name}</h1>
      <SiteHero locations={locations} preparing={d.preparations.length} />
      {topRow.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">{topRow}</div> : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Suivi des opérations</h2>
        <CustomizeDashboard all={[...DASHBOARD_WIDGETS]} selected={d.widgets} />
      </div>
      {monthly && show("kpis") ? (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Facturation, encaissements et dépenses (12 mois)</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyFinanceChart data={monthly} />
          </CardContent>
        </Card>
      ) : null}
      {others.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{others}</div> : null}
    </div>
  );
}
