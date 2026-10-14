import "server-only";
import { db } from "@/lib/db";
import { D, dec, type DecimalValue } from "@/lib/money";
import { assertCan, type AuthContext } from "../auth/context";

/**
 * Indicateurs de rentabilité OPÉRATIONNELS (pas une comptabilité générale).
 * Formules (toutes HT) — détaillées dans docs/BUSINESS_RULES.md :
 *  CA prévisionnel   = Σ devis ACCEPTÉS de l'événement
 *  CA facturé        = Σ factures émises − Σ avoirs émis
 *  Encaissé (TTC)    = Σ paiements des factures de l'événement
 *  MO prévue         = Σ affectations (durée h × coût horaire figé)
 *  MO réalisée       = Σ relevés d'heures × coût horaire de l'affectation
 *  Transport         = Σ affectations véhicule (jours entamés × coût/jour + km × coût/km)
 *  Dépenses          = Σ dépenses rattachées à l'événement
 *  Pertes matériel   = Σ quantités perdues × valeur de remplacement
 *  Coût prévu        = coût estimé saisi si renseigné, sinon MO prévue + transport + dépenses
 *  Coût réel         = MO réalisée (ou prévue si aucun relevé) + transport + dépenses + pertes
 *  Marge prévue      = CA prévisionnel − coût prévu ; marge réelle = CA facturé − coût réel
 */
export interface EventFinancials {
  eventId: string;
  revenueForecast: string;
  revenuePipeline: string;
  revenueInvoiced: string;
  paymentsReceived: string;
  laborPlanned: string;
  laborActual: string;
  transportCost: string;
  expenses: string;
  equipmentLosses: string;
  costForecast: string;
  costActual: string;
  marginForecast: string;
  marginActual: string;
  marginRateForecast: string | null;
  marginRateActual: string | null;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

function addTo(map: Map<string, DecimalValue>, key: string | null, value: DecimalValue) {
  if (!key) return;
  map.set(key, (map.get(key) ?? new D(0)).plus(value));
}

export async function computeEventFinancials(organizationId: string, eventIds: string[]): Promise<Map<string, EventFinancials>> {
  const ids = [...new Set(eventIds)];
  const result = new Map<string, EventFinancials>();
  if (ids.length === 0) return result;

  const [events, quotes, invoices, payments, staff, timesheets, vehicles, expenses, losses] = await Promise.all([
    db.event.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, estimatedCost: true } }),
    db.quote.findMany({ where: { organizationId, eventId: { in: ids }, status: { in: ["ACCEPTED", "SENT"] } }, select: { eventId: true, status: true, totalExclTax: true } }),
    db.invoice.findMany({ where: { organizationId, eventId: { in: ids }, status: { not: "DRAFT" } }, select: { eventId: true, kind: true, totalExclTax: true } }),
    db.payment.findMany({ where: { organizationId, invoice: { eventId: { in: ids } } }, select: { amount: true, invoice: { select: { eventId: true } } } }),
    db.eventStaffAssignment.findMany({ where: { organizationId, eventId: { in: ids }, status: { notIn: ["CANCELLED", "DECLINED"] } }, select: { eventId: true, startAt: true, endAt: true, hourlyCost: true } }),
    db.timesheet.findMany({ where: { organizationId, assignment: { eventId: { in: ids } } }, select: { hours: true, assignment: { select: { eventId: true, hourlyCost: true } } } }),
    db.vehicleAssignment.findMany({ where: { organizationId, eventId: { in: ids }, status: { not: "CANCELLED" } }, select: { eventId: true, startAt: true, endAt: true, distanceKm: true, vehicle: { select: { dailyCost: true, costPerKm: true } } } }),
    db.expense.groupBy({ by: ["eventId"], where: { organizationId, eventId: { in: ids } }, _sum: { amountExclTax: true } }),
    db.reservationLine.findMany({ where: { quantityLost: { gt: 0 }, reservation: { organizationId, eventId: { in: ids } } }, select: { quantityLost: true, product: { select: { replacementValue: true } }, reservation: { select: { eventId: true } } } }),
  ]);

  const forecast = new Map<string, DecimalValue>();
  const pipeline = new Map<string, DecimalValue>();
  for (const q of quotes) addTo(q.status === "ACCEPTED" ? forecast : pipeline, q.eventId, dec(q.totalExclTax));
  const invoiced = new Map<string, DecimalValue>();
  for (const i of invoices) addTo(invoiced, i.eventId, i.kind === "CREDIT_NOTE" ? dec(i.totalExclTax).neg() : dec(i.totalExclTax));
  const paid = new Map<string, DecimalValue>();
  for (const p of payments) addTo(paid, p.invoice.eventId, dec(p.amount));
  const laborPlanned = new Map<string, DecimalValue>();
  for (const s of staff) addTo(laborPlanned, s.eventId, dec(s.hourlyCost ?? 0).mul((s.endAt.getTime() - s.startAt.getTime()) / HOUR));
  const laborActual = new Map<string, DecimalValue>();
  const hasTimesheet = new Set<string>();
  for (const t of timesheets) {
    addTo(laborActual, t.assignment.eventId, dec(t.hours).mul(dec(t.assignment.hourlyCost ?? 0)));
    hasTimesheet.add(t.assignment.eventId);
  }
  const transport = new Map<string, DecimalValue>();
  for (const v of vehicles) {
    const days = Math.max(1, Math.ceil((v.endAt.getTime() - v.startAt.getTime()) / DAY));
    addTo(transport, v.eventId, dec(v.vehicle.dailyCost ?? 0).mul(days).plus(dec(v.vehicle.costPerKm ?? 0).mul(v.distanceKm ?? 0)));
  }
  const expenseMap = new Map<string, DecimalValue>(expenses.filter((e) => e.eventId).map((e) => [e.eventId!, dec(e._sum.amountExclTax ?? 0)]));
  const lossMap = new Map<string, DecimalValue>();
  for (const l of losses) addTo(lossMap, l.reservation.eventId, dec(l.product.replacementValue ?? 0).mul(l.quantityLost));

  const z = new D(0);
  const f2 = (v: DecimalValue) => v.toDecimalPlaces(2).toFixed(2);
  const rate = (margin: DecimalValue, revenue: DecimalValue) => (revenue.isZero() ? null : margin.div(revenue).mul(100).toDecimalPlaces(1).toFixed(1));

  for (const e of events) {
    const rev = forecast.get(e.id) ?? z;
    const inv = invoiced.get(e.id) ?? z;
    const lp = laborPlanned.get(e.id) ?? z;
    const la = hasTimesheet.has(e.id) ? laborActual.get(e.id) ?? z : lp;
    const tr = transport.get(e.id) ?? z;
    const ex = expenseMap.get(e.id) ?? z;
    const lo = lossMap.get(e.id) ?? z;
    const costForecast = e.estimatedCost ? dec(e.estimatedCost) : lp.plus(tr).plus(ex);
    const costActual = la.plus(tr).plus(ex).plus(lo);
    const marginForecast = rev.minus(costForecast);
    const marginActual = inv.minus(costActual);
    result.set(e.id, {
      eventId: e.id,
      revenueForecast: f2(rev),
      revenuePipeline: f2(pipeline.get(e.id) ?? z),
      revenueInvoiced: f2(inv),
      paymentsReceived: f2(paid.get(e.id) ?? z),
      laborPlanned: f2(lp),
      laborActual: f2(hasTimesheet.has(e.id) ? la : z),
      transportCost: f2(tr),
      expenses: f2(ex),
      equipmentLosses: f2(lo),
      costForecast: f2(costForecast),
      costActual: f2(costActual),
      marginForecast: f2(marginForecast),
      marginActual: f2(marginActual),
      marginRateForecast: rate(marginForecast, rev),
      marginRateActual: rate(marginActual, inv),
    });
  }
  return result;
}

export async function getEventFinancials(ctx: AuthContext, eventId: string) {
  assertCan(ctx, "finance:read");
  const map = await computeEventFinancials(ctx.organizationId, [eventId]);
  return map.get(eventId) ?? null;
}

/** Synthèse financière d'une période (événements démarrant dans la période). */
export async function financeOverview(ctx: AuthContext, from: Date, to: Date) {
  assertCan(ctx, "finance:read");
  const now = new Date();
  const events = await db.event.findMany({
    where: { organizationId: ctx.organizationId, startAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
    orderBy: { startAt: "asc" },
    select: { id: true, reference: true, name: true, status: true, startAt: true, customer: { select: { id: true, name: true } } },
  });
  const financials = await computeEventFinancials(ctx.organizationId, events.map((e) => e.id));

  const [invoiced, credited, paymentsAgg, expensesAgg, purchasesAgg, openInvoices] = await Promise.all([
    db.invoice.aggregate({ where: { organizationId: ctx.organizationId, kind: "INVOICE", status: { not: "DRAFT" }, issueDate: { gte: from, lt: to } }, _sum: { totalExclTax: true, totalInclTax: true } }),
    db.invoice.aggregate({ where: { organizationId: ctx.organizationId, kind: "CREDIT_NOTE", status: { not: "DRAFT" }, issueDate: { gte: from, lt: to } }, _sum: { totalExclTax: true } }),
    db.payment.aggregate({ where: { organizationId: ctx.organizationId, paidAt: { gte: from, lt: to } }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["category"], where: { organizationId: ctx.organizationId, incurredAt: { gte: from, lt: to } }, _sum: { amountExclTax: true } }),
    db.goodsReceiptLine.findMany({ where: { receipt: { organizationId: ctx.organizationId, receivedAt: { gte: from, lt: to } } }, select: { quantity: true, orderLine: { select: { unitCost: true } } } }),
    db.invoice.findMany({
      where: { organizationId: ctx.organizationId, kind: "INVOICE", status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      select: { totalInclTax: true, amountPaid: true, dueDate: true, creditNotes: { where: { status: { not: "DRAFT" } }, select: { totalInclTax: true } } },
    }),
  ]);

  let receivables = new D(0);
  let overdue = new D(0);
  for (const i of openInvoices) {
    const due = dec(i.totalInclTax).minus(i.amountPaid).minus(i.creditNotes.reduce((a, c) => a.plus(dec(c.totalInclTax)), new D(0)));
    receivables = receivables.plus(due);
    if (i.dueDate && i.dueDate < now) overdue = overdue.plus(due);
  }
  const purchases = purchasesAgg.reduce((a, l) => a.plus(dec(l.orderLine.unitCost).mul(l.quantity)), new D(0));
  const sum = (key: keyof EventFinancials) => [...financials.values()].reduce((a, f) => a.plus(dec(f[key] as string)), new D(0)).toFixed(2);

  const byCustomer = new Map<string, { customerId: string; name: string; revenueForecast: DecimalValue; revenueInvoiced: DecimalValue; marginForecast: DecimalValue; marginActual: DecimalValue; events: number }>();
  for (const e of events) {
    const f = financials.get(e.id)!;
    const row = byCustomer.get(e.customer.id) ?? { customerId: e.customer.id, name: e.customer.name, revenueForecast: new D(0), revenueInvoiced: new D(0), marginForecast: new D(0), marginActual: new D(0), events: 0 };
    row.revenueForecast = row.revenueForecast.plus(f.revenueForecast);
    row.revenueInvoiced = row.revenueInvoiced.plus(f.revenueInvoiced);
    row.marginForecast = row.marginForecast.plus(f.marginForecast);
    row.marginActual = row.marginActual.plus(f.marginActual);
    row.events++;
    byCustomer.set(e.customer.id, row);
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      revenueForecast: sum("revenueForecast"),
      revenuePipeline: sum("revenuePipeline"),
      revenueInvoicedEvents: sum("revenueInvoiced"),
      invoicedExclTax: dec(invoiced._sum.totalExclTax ?? 0).minus(dec(credited._sum.totalExclTax ?? 0)).toFixed(2),
      paymentsReceived: dec(paymentsAgg._sum.amount ?? 0).toFixed(2),
      receivables: receivables.toFixed(2),
      overdueReceivables: overdue.toFixed(2),
      expenses: expensesAgg.reduce((a, e) => a.plus(dec(e._sum.amountExclTax ?? 0)), new D(0)).toFixed(2),
      purchases: purchases.toFixed(2),
      laborPlanned: sum("laborPlanned"),
      transportCost: sum("transportCost"),
      costForecast: sum("costForecast"),
      costActual: sum("costActual"),
      marginForecast: sum("marginForecast"),
      marginActual: sum("marginActual"),
    },
    expensesByCategory: expensesAgg.map((e) => ({ category: e.category, amount: dec(e._sum.amountExclTax ?? 0).toFixed(2) })),
    events: events.map((e) => ({ id: e.id, reference: e.reference, name: e.name, status: e.status, startAt: e.startAt.toISOString(), customer: e.customer.name, ...financials.get(e.id)! })),
    customers: [...byCustomer.values()]
      .map((c) => ({ ...c, revenueForecast: c.revenueForecast.toFixed(2), revenueInvoiced: c.revenueInvoiced.toFixed(2), marginForecast: c.marginForecast.toFixed(2), marginActual: c.marginActual.toFixed(2) }))
      .sort((a, b) => dec(b.revenueForecast).comparedTo(dec(a.revenueForecast))),
  };
}

/** Série mensuelle (12 mois glissants) : CA facturé HT, encaissements, dépenses. */
export async function monthlySeries(ctx: AuthContext, months = 12) {
  assertCan(ctx, "finance:read");
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const [invoices, payments, expenses] = await Promise.all([
    db.invoice.findMany({ where: { organizationId: ctx.organizationId, status: { not: "DRAFT" }, issueDate: { gte: start } }, select: { kind: true, totalExclTax: true, issueDate: true } }),
    db.payment.findMany({ where: { organizationId: ctx.organizationId, paidAt: { gte: start } }, select: { amount: true, paidAt: true } }),
    db.expense.findMany({ where: { organizationId: ctx.organizationId, incurredAt: { gte: start } }, select: { amountExclTax: true, incurredAt: true } }),
  ]);
  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const buckets = new Map<string, { invoiced: DecimalValue; collected: DecimalValue; expenses: DecimalValue }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    buckets.set(key(d), { invoiced: new D(0), collected: new D(0), expenses: new D(0) });
  }
  for (const i of invoices) {
    const b = buckets.get(key(i.issueDate!));
    if (b) b.invoiced = b.invoiced.plus(i.kind === "CREDIT_NOTE" ? dec(i.totalExclTax).neg() : dec(i.totalExclTax));
  }
  for (const p of payments) {
    const b = buckets.get(key(p.paidAt));
    if (b) b.collected = b.collected.plus(dec(p.amount));
  }
  for (const e of expenses) {
    const b = buckets.get(key(e.incurredAt));
    if (b) b.expenses = b.expenses.plus(dec(e.amountExclTax));
  }
  return [...buckets.entries()].map(([month, b]) => ({ month, invoiced: b.invoiced.toFixed(2), collected: b.collected.toFixed(2), expenses: b.expenses.toFixed(2) }));
}
