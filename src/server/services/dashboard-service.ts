import "server-only";
import { db } from "@/lib/db";
import { addDays, startOfDayInZone, utcToZonedLocalInput, zonedLocalToUtc } from "@/lib/dates";
import { D, dec } from "@/lib/money";
import { assertCan, can, type AuthContext } from "../auth/context";
import { financeOverview } from "./finance-service";
import { stockSummaries } from "./inventory-service";
import { vehicleOpsStatus } from "./vehicle-service";

export const DASHBOARD_WIDGETS = [
  "kpis",
  "upcomingEvents",
  "preparations",
  "returns",
  "tasks",
  "stockAlerts",
  "vehicles",
  "quotes",
  "invoices",
  "activity",
] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

/** Données du tableau de bord — chaque bloc n'est calculé que si l'utilisateur a le droit de le voir. */
export async function getDashboard(ctx: AuthContext) {
  assertCan(ctx, "dashboard:read");
  const org = ctx.organizationId;
  const tz = ctx.organization.timezone;
  const now = new Date();
  const todayStart = startOfDayInZone(now, tz);
  const tomorrow = addDays(todayStart, 1);
  const in2days = addDays(todayStart, 2);

  const upcomingEvents = can(ctx, "events:read")
    ? await db.event.findMany({
        where: { organizationId: org, endAt: { gte: now }, startAt: { lt: addDays(now, 30) }, status: { notIn: ["CANCELLED", "COMPLETED"] } },
        orderBy: { startAt: "asc" },
        take: 8,
        select: { id: true, reference: true, name: true, status: true, startAt: true, endAt: true, timezone: true, city: true, customer: { select: { name: true } } },
      })
    : [];

  const reservationsVisible = can(ctx, "reservations:read");
  const [preparations, returns] = reservationsVisible
    ? await Promise.all([
        db.reservation.findMany({
          where: { organizationId: org, status: { in: ["CONFIRMED", "IN_PREPARATION", "PREPARED"] }, startAt: { lt: addDays(in2days, 1) } },
          orderBy: { startAt: "asc" },
          take: 10,
          select: { id: true, reference: true, status: true, startAt: true, prepBufferHours: true, event: { select: { name: true, timezone: true } }, lines: { select: { quantity: true, quantityPrepared: true } } },
        }),
        db.reservation.findMany({
          where: { organizationId: org, status: { in: ["SHIPPED", "PARTIALLY_RETURNED"] }, endAt: { lt: in2days } },
          orderBy: { endAt: "asc" },
          take: 10,
          select: { id: true, reference: true, status: true, endAt: true, event: { select: { name: true, timezone: true } } },
        }),
      ])
    : [[], []];

  const tasks = can(ctx, "events:read")
    ? await db.eventTask.findMany({
        where: { organizationId: org, status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lt: tomorrow } },
        orderBy: { dueAt: "asc" },
        take: 10,
        select: { id: true, title: true, priority: true, dueAt: true, event: { select: { id: true, reference: true } } },
      })
    : [];

  let stockAlerts: { lowStock: { id: string; name: string; sku: string; available: number; threshold: number }[]; quarantineUnits: number; openTickets: number } | null = null;
  if (can(ctx, "stock:read")) {
    const products = await db.equipmentProduct.findMany({ where: { organizationId: org, archivedAt: null, stockManaged: true, alertThreshold: { gt: 0 } }, select: { id: true, name: true, sku: true, alertThreshold: true } });
    const summaries = await stockSummaries(org, products.map((p) => p.id));
    const [quarantine, openTickets] = await Promise.all([
      db.stockBalance.aggregate({ where: { organizationId: org, location: { kind: { in: ["QUARANTINE", "MAINTENANCE"] } } }, _sum: { quantity: true } }),
      db.maintenanceTicket.count({ where: { organizationId: org, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    ]);
    stockAlerts = {
      lowStock: products
        .map((p) => ({ id: p.id, name: p.name, sku: p.sku, available: summaries.get(p.id)!.availableNow, threshold: p.alertThreshold }))
        .filter((p) => p.available <= p.threshold)
        .slice(0, 10),
      quarantineUnits: quarantine._sum.quantity ?? 0,
      openTickets,
    };
  }

  let vehicles: { total: number; onMission: number; assigned: number; maintenance: number; available: number } | null = null;
  if (can(ctx, "vehicles:read")) {
    const rows = await db.vehicle.findMany({
      where: { organizationId: org, status: { not: "RETIRED" } },
      select: {
        status: true,
        assignments: { where: { status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] }, endAt: { gt: now } }, select: { startAt: true, endAt: true, status: true } },
        maintenances: { where: { completedAt: null }, select: { scheduledAt: true, completedAt: true, blocksVehicle: true } },
      },
    });
    const ops = rows.map((r) => vehicleOpsStatus(r, now));
    vehicles = {
      total: rows.length,
      onMission: ops.filter((o) => o === "ON_MISSION").length,
      assigned: ops.filter((o) => o === "ASSIGNED").length,
      maintenance: ops.filter((o) => o === "MAINTENANCE" || o === "UNAVAILABLE").length,
      available: ops.filter((o) => o === "AVAILABLE").length,
    };
  }

  const quotes = can(ctx, "quotes:read")
    ? await (async () => {
        const [pending, followUps, rows] = await Promise.all([
          db.quote.aggregate({ where: { organizationId: org, status: "SENT" }, _count: true, _sum: { totalExclTax: true } }),
          db.quote.count({ where: { organizationId: org, status: "SENT", followUpAt: { lte: now } } }),
          db.quote.findMany({ where: { organizationId: org, status: "SENT" }, orderBy: { followUpAt: "asc" }, take: 5, select: { id: true, number: true, title: true, totalExclTax: true, followUpAt: true, customer: { select: { name: true } } } }),
        ]);
        return {
          pendingCount: pending._count,
          pendingAmount: dec(pending._sum.totalExclTax ?? 0).toFixed(2),
          followUps,
          items: rows.map((q) => ({ ...q, totalExclTax: dec(q.totalExclTax).toFixed(2), followUpAt: q.followUpAt?.toISOString() ?? null, needsFollowUp: Boolean(q.followUpAt && q.followUpAt <= now) })),
        };
      })()
    : null;

  const invoices = can(ctx, "invoices:read")
    ? await (async () => {
        const open = await db.invoice.findMany({
          where: { organizationId: org, kind: "INVOICE", status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
          orderBy: { dueDate: "asc" },
          select: { id: true, number: true, dueDate: true, totalInclTax: true, amountPaid: true, customer: { select: { name: true } }, creditNotes: { where: { status: { not: "DRAFT" } }, select: { totalInclTax: true } } },
        });
        let unpaid = new D(0);
        let overdueAmount = new D(0);
        const items = open.map((i) => {
          const due = dec(i.totalInclTax).minus(i.amountPaid).minus(i.creditNotes.reduce((a, c) => a.plus(dec(c.totalInclTax)), new D(0)));
          unpaid = unpaid.plus(due);
          const overdue = Boolean(i.dueDate && i.dueDate < now);
          if (overdue) overdueAmount = overdueAmount.plus(due);
          return { id: i.id, number: i.number, customer: i.customer.name, dueDate: i.dueDate?.toISOString() ?? null, balanceDue: due.toFixed(2), overdue };
        });
        return { unpaidCount: items.length, unpaidAmount: unpaid.toFixed(2), overdueCount: items.filter((i) => i.overdue).length, overdueAmount: overdueAmount.toFixed(2), items: items.filter((i) => i.overdue).slice(0, 5) };
      })()
    : null;

  const finance = can(ctx, "finance:read") ? (await financeOverview(ctx, todayStart, addDays(todayStart, 90))).totals : null;

  const activity = await db.auditLog.findMany({
    where: {
      organizationId: org,
      ...(can(ctx, "audit:read") ? {} : { actorId: ctx.userId }),
      action: { notIn: ["auth.login"] },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, actor: { select: { name: true } } },
  });

  // Calendrier du mois en cours (fuseau de l'organisation) et série d'événements sur 6 mois
  const todayLocal = utcToZonedLocalInput(now, tz).slice(0, 10);
  const [year, month] = todayLocal.split("-").map(Number) as [number, number];
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = zonedLocalToUtc(`${year}-${pad(month)}-01T00:00`, tz);
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const monthEnd = zonedLocalToUtc(`${nextMonth.y}-${pad(nextMonth.m)}-01T00:00`, tz);
  const seriesStart = zonedLocalToUtc(`${month > 5 ? year : year - 1}-${pad(((month - 6 + 12) % 12) + 1)}-01T00:00`, tz);
  const calendarEvents = can(ctx, "events:read")
    ? await db.event.findMany({
        where: { organizationId: org, status: { not: "CANCELLED" }, startAt: { gte: seriesStart, lt: monthEnd } },
        select: { startAt: true, status: true },
      })
    : [];
  const monthKeys = Array.from({ length: 6 }, (_, i) => {
    const m = ((month - 6 + i + 12) % 12) + 1;
    const y = month - 6 + i < 0 ? year - 1 : year;
    return `${y}-${pad(m)}`;
  });
  const eventsByMonth = new Map(monthKeys.map((k) => [k, 0]));
  const eventDays = new Set<string>();
  for (const e of calendarEvents) {
    const local = utcToZonedLocalInput(e.startAt, tz).slice(0, 10);
    const key = local.slice(0, 7);
    if (eventsByMonth.has(key)) eventsByMonth.set(key, eventsByMonth.get(key)! + 1);
    if (e.startAt >= monthStart) eventDays.add(local);
  }

  // Taux d'utilisation du parc : unités hors stockage (préparation, sorties) / unités possédées
  let stockUsage: number | null = null;
  if (can(ctx, "stock:read")) {
    const [all, out] = await Promise.all([
      db.stockBalance.aggregate({ where: { organizationId: org, quantity: { gt: 0 } }, _sum: { quantity: true } }),
      db.stockBalance.aggregate({ where: { organizationId: org, quantity: { gt: 0 }, location: { kind: { in: ["PREPARATION", "OUT"] } } }, _sum: { quantity: true } }),
    ]);
    const total = all._sum.quantity ?? 0;
    stockUsage = total ? Math.round(((out._sum.quantity ?? 0) / total) * 100) : 0;
  }

  const membership = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: org, userId: ctx.userId } }, select: { dashboardWidgets: true } });

  return {
    widgets: membership?.dashboardWidgets?.length ? (membership.dashboardWidgets.filter((w) => (DASHBOARD_WIDGETS as readonly string[]).includes(w)) as DashboardWidget[]) : [...DASHBOARD_WIDGETS],
    upcomingEvents: upcomingEvents.map((e) => ({ ...e, startAt: e.startAt.toISOString(), endAt: e.endAt.toISOString() })),
    preparations: preparations.map((r) => {
      const total = r.lines.reduce((a, l) => a + l.quantity, 0);
      const prepared = r.lines.reduce((a, l) => a + l.quantityPrepared, 0);
      return { id: r.id, reference: r.reference, status: r.status, eventName: r.event.name, timezone: r.event.timezone, departure: r.startAt.toISOString(), progress: total ? Math.round((prepared / total) * 100) : 0, late: r.startAt < now };
    }),
    returns: returns.map((r) => ({ id: r.id, reference: r.reference, status: r.status, eventName: r.event.name, timezone: r.event.timezone, expectedAt: r.endAt.toISOString(), late: r.endAt < now })),
    tasks: tasks.map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null, overdue: Boolean(t.dueAt && t.dueAt < now) })),
    stockAlerts,
    vehicles,
    quotes,
    invoices,
    finance,
    calendar: { today: todayLocal, year, month, eventDays: [...eventDays].sort() },
    eventsSeries: [...eventsByMonth.entries()].map(([m, count]) => ({ month: m, count })),
    stockUsage,
    activity: activity.map((a) => ({ id: a.id, action: a.action, entityType: a.entityType, entityId: a.entityId, createdAt: a.createdAt.toISOString(), actor: a.actor?.name ?? "Système" })),
  };
}

export async function saveDashboardWidgets(ctx: AuthContext, widgets: DashboardWidget[]) {
  assertCan(ctx, "dashboard:read");
  await db.membership.update({
    where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } },
    data: { dashboardWidgets: widgets },
  });
}
