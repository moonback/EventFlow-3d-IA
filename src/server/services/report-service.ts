import "server-only";
import { db } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { eventStatusLabels, quoteStatusLabels } from "@/lib/labels";
import { D, dec } from "@/lib/money";
import type { Permission } from "@/lib/permissions";
import { BLOCKING_STATUSES } from "@/features/inventory/availability";
import { assertCan, type AuthContext } from "../auth/context";
import { computeEventFinancials } from "./finance-service";
import { stockSummaries } from "./inventory-service";

export interface ReportColumn {
  key: string;
  label: string;
  type?: "text" | "number" | "money" | "percent" | "date";
}
export interface ReportResult {
  key: ReportKey;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
}

export const REPORTS = {
  activity: { title: "Activité par période", description: "Événements par mois et par type (hors annulés).", permissions: ["events:read"] },
  profitability: { title: "Rentabilité des événements", description: "CA, coûts et marges prévisionnels et réels par événement.", permissions: ["finance:read"] },
  utilization: { title: "Utilisation du matériel", description: "Taux d'occupation (unités × jours réservés / capacité × jours de la période).", permissions: ["inventory:read"] },
  stock: { title: "État du stock", description: "Répartition des quantités par état et valeur de remplacement.", permissions: ["stock:read"] },
  immobilized: { title: "Matériel immobilisé", description: "Unités en quarantaine ou en maintenance et valeur immobilisée.", permissions: ["stock:read"] },
  sales: { title: "Performance commerciale", description: "Devis émis par statut, montants et taux de transformation.", permissions: ["quotes:read"] },
  latePayments: { title: "Retards de paiement", description: "Factures échues non soldées.", permissions: ["invoices:read"] },
  logistics: { title: "Coûts logistiques", description: "Coûts de transport et mobilisation des véhicules par événement.", permissions: ["finance:read", "vehicles:read"] },
  workload: { title: "Charge de travail", description: "Heures prévues et réalisées par collaborateur.", permissions: ["staff:read"] },
} as const satisfies Record<string, { title: string; description: string; permissions: Permission[] }>;
export type ReportKey = keyof typeof REPORTS;

export function isReportKey(v: string): v is ReportKey {
  return v in REPORTS;
}

export function availableReports(ctx: AuthContext) {
  return (Object.entries(REPORTS) as [ReportKey, (typeof REPORTS)[ReportKey]][])
    .filter(([, r]) => r.permissions.every((p) => ctx.permissions.has(p)))
    .map(([key, r]) => ({ key, title: r.title, description: r.description }));
}

const DAY = 86_400_000;

export async function runReport(ctx: AuthContext, key: ReportKey, from: Date, to: Date): Promise<ReportResult> {
  assertCan(ctx, "reports:read");
  const def = REPORTS[key];
  for (const p of def.permissions) if (!ctx.permissions.has(p)) throw new ForbiddenError(`Permission requise : ${p}`);
  if (to <= from) throw new ValidationError("Période invalide");
  if (to.getTime() - from.getTime() > 3 * 366 * DAY) throw new ValidationError("Période limitée à 3 ans");
  const org = ctx.organizationId;
  const base = { key, title: def.title, description: def.description };

  switch (key) {
    case "activity": {
      const events = await db.event.findMany({
        where: { organizationId: org, startAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
        select: { startAt: true, status: true, eventType: { select: { name: true } }, guestCount: true },
      });
      const map = new Map<string, { month: string; type: string; count: number; completed: number; guests: number }>();
      for (const e of events) {
        const month = e.startAt.toISOString().slice(0, 7);
        const type = e.eventType?.name ?? "Sans type";
        const k = `${month}|${type}`;
        const row = map.get(k) ?? { month, type, count: 0, completed: 0, guests: 0 };
        row.count++;
        if (e.status === "COMPLETED") row.completed++;
        row.guests += e.guestCount ?? 0;
        map.set(k, row);
      }
      return {
        ...base,
        columns: [
          { key: "month", label: "Mois" },
          { key: "type", label: "Type" },
          { key: "count", label: "Événements", type: "number" },
          { key: "completed", label: "Terminés", type: "number" },
          { key: "guests", label: "Invités", type: "number" },
        ],
        rows: [...map.values()].sort((a, b) => a.month.localeCompare(b.month) || a.type.localeCompare(b.type)),
      };
    }
    case "profitability": {
      const events = await db.event.findMany({
        where: { organizationId: org, startAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
        orderBy: { startAt: "asc" },
        select: { id: true, reference: true, name: true, status: true, startAt: true, customer: { select: { name: true } } },
      });
      const fin = await computeEventFinancials(org, events.map((e) => e.id));
      return {
        ...base,
        columns: [
          { key: "reference", label: "Référence" },
          { key: "name", label: "Événement" },
          { key: "customer", label: "Client" },
          { key: "startAt", label: "Date", type: "date" },
          { key: "status", label: "Statut" },
          { key: "revenueForecast", label: "CA prévu HT", type: "money" },
          { key: "revenueInvoiced", label: "CA facturé HT", type: "money" },
          { key: "costForecast", label: "Coût prévu", type: "money" },
          { key: "costActual", label: "Coût réel", type: "money" },
          { key: "marginForecast", label: "Marge prévue", type: "money" },
          { key: "marginActual", label: "Marge réelle", type: "money" },
          { key: "marginRateActual", label: "Taux marge réelle", type: "percent" },
        ],
        rows: events.map((e) => {
          const f = fin.get(e.id)!;
          return {
            reference: e.reference,
            name: e.name,
            customer: e.customer.name,
            startAt: e.startAt.toISOString(),
            status: eventStatusLabels[e.status],
            revenueForecast: f.revenueForecast,
            revenueInvoiced: f.revenueInvoiced,
            costForecast: f.costForecast,
            costActual: f.costActual,
            marginForecast: f.marginForecast,
            marginActual: f.marginActual,
            marginRateActual: f.marginRateActual,
          };
        }),
      };
    }
    case "utilization": {
      const products = await db.equipmentProduct.findMany({
        where: { organizationId: org, archivedAt: null, stockManaged: true },
        orderBy: { name: "asc" },
        select: { id: true, sku: true, name: true, category: { select: { name: true } } },
      });
      const summaries = await stockSummaries(org, products.map((p) => p.id));
      const lines = await db.reservationLine.findMany({
        where: { productId: { in: products.map((p) => p.id) }, reservation: { organizationId: org, status: { in: [...BLOCKING_STATUSES, "RETURNED"] }, startAt: { lt: to }, endAt: { gt: from } } },
        select: { productId: true, quantity: true, reservation: { select: { startAt: true, endAt: true } } },
      });
      const periodDays = (to.getTime() - from.getTime()) / DAY;
      const usage = new Map<string, number>();
      for (const l of lines) {
        const s = Math.max(l.reservation.startAt.getTime(), from.getTime());
        const e = Math.min(l.reservation.endAt.getTime(), to.getTime());
        usage.set(l.productId, (usage.get(l.productId) ?? 0) + (l.quantity * Math.max(0, e - s)) / DAY);
      }
      return {
        ...base,
        columns: [
          { key: "sku", label: "SKU" },
          { key: "name", label: "Produit" },
          { key: "category", label: "Catégorie" },
          { key: "owned", label: "Unités possédées", type: "number" },
          { key: "unitDays", label: "Unités × jours réservés", type: "number" },
          { key: "rate", label: "Taux d'occupation", type: "percent" },
        ],
        rows: products
          .map((p) => {
            const owned = summaries.get(p.id)!.total;
            const unitDays = Math.round((usage.get(p.id) ?? 0) * 10) / 10;
            const rate = owned > 0 ? ((unitDays / (owned * periodDays)) * 100).toFixed(1) : null;
            return { sku: p.sku, name: p.name, category: p.category.name, owned, unitDays, rate };
          })
          .sort((a, b) => Number(b.rate ?? -1) - Number(a.rate ?? -1)),
      };
    }
    case "stock":
    case "immobilized": {
      const products = await db.equipmentProduct.findMany({
        where: { organizationId: org, archivedAt: null, stockManaged: true },
        orderBy: { name: "asc" },
        select: { id: true, sku: true, name: true, replacementValue: true, alertThreshold: true, category: { select: { name: true } } },
      });
      const summaries = await stockSummaries(org, products.map((p) => p.id));
      const canValue = ctx.permissions.has("finance:read") || ctx.permissions.has("inventory:write");
      if (key === "stock") {
        return {
          ...base,
          columns: [
            { key: "sku", label: "SKU" },
            { key: "name", label: "Produit" },
            { key: "category", label: "Catégorie" },
            { key: "total", label: "Total", type: "number" },
            { key: "inStorage", label: "En rayon", type: "number" },
            { key: "inPreparation", label: "En préparation", type: "number" },
            { key: "inTransit", label: "Sorti", type: "number" },
            { key: "inReturn", label: "En retour", type: "number" },
            { key: "damaged", label: "Endommagé", type: "number" },
            { key: "inMaintenance", label: "Maintenance", type: "number" },
            { key: "reserved", label: "Réservé", type: "number" },
            { key: "availableNow", label: "Disponible", type: "number" },
            ...(canValue ? [{ key: "value", label: "Valeur de remplacement", type: "money" as const }] : []),
          ],
          rows: products.map((p) => {
            const s = summaries.get(p.id)!;
            return { sku: p.sku, name: p.name, category: p.category.name, ...s, ...(canValue ? { value: dec(p.replacementValue ?? 0).mul(s.total).toFixed(2) } : {}) };
          }),
        };
      }
      return {
        ...base,
        columns: [
          { key: "sku", label: "SKU" },
          { key: "name", label: "Produit" },
          { key: "damaged", label: "Quarantaine", type: "number" },
          { key: "inMaintenance", label: "Atelier", type: "number" },
          { key: "share", label: "Part du parc", type: "percent" },
          ...(canValue ? [{ key: "value", label: "Valeur immobilisée", type: "money" as const }] : []),
        ],
        rows: products
          .map((p) => ({ p, s: summaries.get(p.id)! }))
          .filter(({ s }) => s.damaged + s.inMaintenance > 0)
          .map(({ p, s }) => ({
            sku: p.sku,
            name: p.name,
            damaged: s.damaged,
            inMaintenance: s.inMaintenance,
            share: s.total ? (((s.damaged + s.inMaintenance) / s.total) * 100).toFixed(1) : null,
            ...(canValue ? { value: dec(p.replacementValue ?? 0).mul(s.damaged + s.inMaintenance).toFixed(2) } : {}),
          })),
      };
    }
    case "sales": {
      const quotes = await db.quote.findMany({
        where: { organizationId: org, issueDate: { gte: from, lt: to } },
        select: { status: true, totalExclTax: true, customer: { select: { name: true } } },
      });
      const byStatus = new Map<string, { count: number; amount: InstanceType<typeof D> }>();
      for (const q of quotes) {
        const r = byStatus.get(q.status) ?? { count: 0, amount: new D(0) };
        r.count++;
        r.amount = r.amount.plus(dec(q.totalExclTax));
        byStatus.set(q.status, r);
      }
      const decided = (byStatus.get("ACCEPTED")?.count ?? 0) + (byStatus.get("DECLINED")?.count ?? 0) + (byStatus.get("EXPIRED")?.count ?? 0);
      const conversion = decided ? (((byStatus.get("ACCEPTED")?.count ?? 0) / decided) * 100).toFixed(1) : null;
      const canAmounts = ctx.permissions.has("finance:read") || ctx.permissions.has("quotes:write");
      return {
        ...base,
        description: `${base.description} Taux de transformation (acceptés / décidés) : ${conversion ?? "—"} %.`,
        columns: [
          { key: "status", label: "Statut" },
          { key: "count", label: "Devis", type: "number" },
          ...(canAmounts ? [{ key: "amount", label: "Montant HT", type: "money" as const }] : []),
          { key: "share", label: "Part", type: "percent" },
        ],
        rows: [...byStatus.entries()].map(([status, r]) => ({
          status: quoteStatusLabels[status as keyof typeof quoteStatusLabels],
          count: r.count,
          ...(canAmounts ? { amount: r.amount.toFixed(2) } : {}),
          share: quotes.length ? ((r.count / quotes.length) * 100).toFixed(1) : null,
        })),
      };
    }
    case "latePayments": {
      const now = new Date();
      const invoices = await db.invoice.findMany({
        where: { organizationId: org, kind: "INVOICE", status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } },
        orderBy: { dueDate: "asc" },
        select: { number: true, title: true, dueDate: true, totalInclTax: true, amountPaid: true, customer: { select: { name: true, email: true } }, creditNotes: { where: { status: { not: "DRAFT" } }, select: { totalInclTax: true } } },
      });
      return {
        ...base,
        columns: [
          { key: "number", label: "Facture" },
          { key: "customer", label: "Client" },
          { key: "dueDate", label: "Échéance", type: "date" },
          { key: "daysLate", label: "Jours de retard", type: "number" },
          { key: "totalInclTax", label: "Total TTC", type: "money" },
          { key: "balanceDue", label: "Reste dû", type: "money" },
        ],
        rows: invoices.map((i) => ({
          number: i.number,
          customer: i.customer.name,
          dueDate: i.dueDate!.toISOString(),
          daysLate: Math.floor((now.getTime() - i.dueDate!.getTime()) / DAY),
          totalInclTax: dec(i.totalInclTax).toFixed(2),
          balanceDue: dec(i.totalInclTax).minus(i.amountPaid).minus(i.creditNotes.reduce((a, c) => a.plus(dec(c.totalInclTax)), new D(0))).toFixed(2),
        })),
      };
    }
    case "logistics": {
      const assignments = await db.vehicleAssignment.findMany({
        where: { organizationId: org, status: { not: "CANCELLED" }, startAt: { gte: from, lt: to } },
        select: { startAt: true, endAt: true, distanceKm: true, event: { select: { id: true, reference: true, name: true } }, vehicle: { select: { registration: true, dailyCost: true, costPerKm: true } } },
      });
      const map = new Map<string, { reference: string; name: string; vehicles: Set<string>; days: number; km: number; cost: InstanceType<typeof D> }>();
      for (const a of assignments) {
        const row = map.get(a.event.id) ?? { reference: a.event.reference, name: a.event.name, vehicles: new Set<string>(), days: 0, km: 0, cost: new D(0) };
        const days = Math.max(1, Math.ceil((a.endAt.getTime() - a.startAt.getTime()) / DAY));
        row.vehicles.add(a.vehicle.registration);
        row.days += days;
        row.km += a.distanceKm ?? 0;
        row.cost = row.cost.plus(dec(a.vehicle.dailyCost ?? 0).mul(days)).plus(dec(a.vehicle.costPerKm ?? 0).mul(a.distanceKm ?? 0));
        map.set(a.event.id, row);
      }
      const fuel = await db.expense.groupBy({ by: ["eventId"], where: { organizationId: org, category: { in: ["TRANSPORT", "FUEL"] }, incurredAt: { gte: from, lt: to }, eventId: { not: null } }, _sum: { amountExclTax: true } });
      return {
        ...base,
        columns: [
          { key: "reference", label: "Événement" },
          { key: "name", label: "Nom" },
          { key: "vehicles", label: "Véhicules" },
          { key: "days", label: "Jours-véhicule", type: "number" },
          { key: "km", label: "Km", type: "number" },
          { key: "fleetCost", label: "Coût flotte", type: "money" },
          { key: "transportExpenses", label: "Frais transport/carburant", type: "money" },
        ],
        rows: [...map.entries()].map(([eventId, r]) => ({
          reference: r.reference,
          name: r.name,
          vehicles: [...r.vehicles].join(", "),
          days: r.days,
          km: r.km,
          fleetCost: r.cost.toFixed(2),
          transportExpenses: dec(fuel.find((f) => f.eventId === eventId)?._sum.amountExclTax ?? 0).toFixed(2),
        })),
      };
    }
    case "workload": {
      const staff = await db.staffMember.findMany({
        where: { organizationId: org },
        orderBy: { lastName: "asc" },
        select: {
          firstName: true, lastName: true, jobTitle: true, isActive: true,
          assignments: { where: { status: { notIn: ["CANCELLED", "DECLINED"] }, startAt: { lt: to }, endAt: { gt: from } }, select: { startAt: true, endAt: true } },
          vehicleAssignments: { where: { status: { not: "CANCELLED" }, startAt: { lt: to }, endAt: { gt: from } }, select: { id: true } },
          timesheets: { where: { workDate: { gte: from, lt: to } }, select: { hours: true } },
        },
      });
      return {
        ...base,
        columns: [
          { key: "name", label: "Collaborateur" },
          { key: "jobTitle", label: "Poste" },
          { key: "assignments", label: "Missions", type: "number" },
          { key: "driving", label: "Conduites", type: "number" },
          { key: "plannedHours", label: "Heures prévues", type: "number" },
          { key: "workedHours", label: "Heures réalisées", type: "number" },
        ],
        rows: staff
          .filter((s) => s.isActive || s.assignments.length > 0)
          .map((s) => ({
            name: `${s.firstName} ${s.lastName}`,
            jobTitle: s.jobTitle,
            assignments: s.assignments.length,
            driving: s.vehicleAssignments.length,
            plannedHours: Math.round(s.assignments.reduce((a, x) => a + (Math.min(x.endAt.getTime(), to.getTime()) - Math.max(x.startAt.getTime(), from.getTime())) / 3_600_000, 0) * 10) / 10,
            workedHours: Number(s.timesheets.reduce((a, t) => a.plus(dec(t.hours)), new D(0)).toFixed(2)),
          })),
      };
    }
  }
}

/** Export CSV (séparateur « ; », BOM UTF-8 pour Excel, neutralisation des formules). */
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    let s = String(value);
    // Protection contre l'injection de formules dans les tableurs
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => escape(c.label)).join(";"), ...rows.map((r) => columns.map((c) => escape(r[c.key])).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
