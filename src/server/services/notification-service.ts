import "server-only";
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { notificationTypeLabels } from "@/lib/labels";
import type { AuthContext } from "../auth/context";
import { sendMail } from "../mail";
import { FINANCE_ROLES, LOGISTICS_ROLES, MANAGEMENT_ROLES, notifyRoles, SALES_ROLES } from "./common";
import { stockSummaries } from "./inventory-service";

export async function listNotifications(ctx: AuthContext, opts: { unreadOnly?: boolean; take?: number } = {}) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts.take ?? 30,
      select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { organizationId: ctx.organizationId, userId: ctx.userId, readAt: null } }),
  ]);
  return { unread, items: items.map((n) => ({ ...n, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })) };
}

export async function markNotificationsRead(ctx: AuthContext, ids: string[] | "all") {
  const r = await db.notification.updateMany({
    where: { organizationId: ctx.organizationId, userId: ctx.userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return { updated: r.count };
}

export async function getNotificationPreferences(ctx: AuthContext) {
  const prefs = await db.notificationPreference.findMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId } });
  return (Object.keys(notificationTypeLabels) as NotificationType[]).map((type) => {
    const p = prefs.find((x) => x.type === type);
    return { type, label: notificationTypeLabels[type], inApp: p?.inApp ?? true, email: p?.email ?? false };
  });
}

export async function saveNotificationPreferences(ctx: AuthContext, prefs: { type: NotificationType; inApp: boolean; email: boolean }[]) {
  await db.$transaction(
    prefs.map((p) =>
      db.notificationPreference.upsert({
        where: { organizationId_userId_type: { organizationId: ctx.organizationId, userId: ctx.userId, type: p.type } },
        create: { organizationId: ctx.organizationId, userId: ctx.userId, type: p.type, inApp: p.inApp, email: p.email },
        update: { inApp: p.inApp, email: p.email },
      }),
    ),
  );
}

export async function deleteNotification(ctx: AuthContext, id: string) {
  const r = await db.notification.deleteMany({ where: { id, userId: ctx.userId, organizationId: ctx.organizationId } });
  if (r.count === 0) throw new NotFoundError("Notification");
}

const DAY = 86_400_000;

/**
 * Analyse périodique des alertes d'une organisation (idempotente grâce aux clés de
 * déduplication journalières). Lancée par `npm run jobs:alerts` ou POST /api/jobs/alerts.
 */
export async function runAlertScan(organizationId: string, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  let created = 0;
  await db.$transaction(async (tx) => {
    // Retours en retard
    const lateReturns = await tx.reservation.findMany({ where: { organizationId, status: { in: ["SHIPPED", "PARTIALLY_RETURNED"] }, endAt: { lt: now } }, select: { id: true, reference: true, event: { select: { name: true } } } });
    for (const r of lateReturns) {
      created += await notifyRoles(tx, organizationId, LOGISTICS_ROLES, { type: "RETURN_LATE", title: `Retour en retard : ${r.reference}`, body: r.event.name, link: `/reservations/${r.id}`, dedupeKey: `return-late:${r.id}:${day}` });
    }
    // Départs dans les 24 h et préparations incomplètes
    const departures = await tx.reservation.findMany({
      where: { organizationId, status: { in: ["CONFIRMED", "IN_PREPARATION", "PREPARED"] }, startAt: { gte: now, lt: new Date(now.getTime() + DAY) } },
      select: { id: true, reference: true, status: true, event: { select: { name: true } }, lines: { select: { quantity: true, quantityPrepared: true } } },
    });
    for (const r of departures) {
      created += await notifyRoles(tx, organizationId, LOGISTICS_ROLES, { type: "DEPARTURE_SOON", title: `Départ imminent : ${r.reference}`, body: r.event.name, link: `/reservations/${r.id}`, dedupeKey: `departure:${r.id}:${day}` });
      if (r.lines.some((l) => l.quantityPrepared < l.quantity)) {
        created += await notifyRoles(tx, organizationId, LOGISTICS_ROLES, { type: "PREPARATION_INCOMPLETE", title: `Préparation incomplète : ${r.reference}`, body: `Départ dans moins de 24 h — ${r.event.name}`, link: `/reservations/${r.id}`, dedupeKey: `prep-incomplete:${r.id}:${day}` });
      }
    }
    // Factures en retard
    const overdue = await tx.invoice.findMany({ where: { organizationId, kind: "INVOICE", status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } }, select: { id: true, number: true, customer: { select: { name: true } } } });
    for (const i of overdue) {
      created += await notifyRoles(tx, organizationId, FINANCE_ROLES, { type: "INVOICE_OVERDUE", title: `Facture en retard : ${i.number}`, body: i.customer.name, link: `/invoices/${i.id}`, dedupeKey: `invoice-overdue:${i.id}:${day}` });
    }
    // Devis à relancer
    const followUps = await tx.quote.findMany({ where: { organizationId, status: "SENT", followUpAt: { lte: now } }, select: { id: true, number: true, customer: { select: { name: true } } } });
    for (const q of followUps) {
      created += await notifyRoles(tx, organizationId, SALES_ROLES, { type: "QUOTE_FOLLOW_UP", title: `Devis à relancer : ${q.number}`, body: q.customer.name, link: `/quotes/${q.id}`, dedupeKey: `quote-follow:${q.id}:${day}` });
    }
    // Tâches en retard
    const tasks = await tx.eventTask.findMany({ where: { organizationId, status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lt: now } }, select: { id: true, title: true, eventId: true } });
    for (const t of tasks) {
      created += await notifyRoles(tx, organizationId, MANAGEMENT_ROLES, { type: "TASK_OVERDUE", title: `Tâche en retard : ${t.title}`, link: t.eventId ? `/events/${t.eventId}` : "/events/tasks", dedupeKey: `task-overdue:${t.id}:${day}` });
    }
    // Entretiens véhicules
    const vehicles = await tx.vehicle.findMany({
      where: { organizationId, status: { not: "RETIRED" }, OR: [{ nextServiceAt: { lt: new Date(now.getTime() + 7 * DAY) } }, { inspectionDueAt: { lt: new Date(now.getTime() + 14 * DAY) } }, { insuranceExpiresAt: { lt: new Date(now.getTime() + 14 * DAY) } }] },
      select: { id: true, registration: true },
    });
    for (const v of vehicles) {
      created += await notifyRoles(tx, organizationId, LOGISTICS_ROLES, { type: "MAINTENANCE_DUE", title: `Échéance véhicule : ${v.registration}`, body: "Entretien, contrôle technique ou assurance à prévoir", link: `/vehicles/${v.id}`, dedupeKey: `vehicle-due:${v.id}:${day}` });
    }
  });
  // Seuils de stock (hors transaction : lecture agrégée)
  const products = await db.equipmentProduct.findMany({ where: { organizationId, archivedAt: null, stockManaged: true, alertThreshold: { gt: 0 } }, select: { id: true, name: true, alertThreshold: true } });
  const summaries = await stockSummaries(organizationId, products.map((p) => p.id));
  for (const p of products) {
    const s = summaries.get(p.id)!;
    if (s.availableNow <= p.alertThreshold) {
      created += await notifyRoles(db, organizationId, LOGISTICS_ROLES, { type: "LOW_STOCK", title: `Stock bas : ${p.name}`, body: `Disponible : ${s.availableNow} (seuil ${p.alertThreshold})`, link: `/inventory/${p.id}`, dedupeKey: `low-stock:${p.id}:${day}` });
    }
  }
  return { created };
}

/**
 * Envoi des e-mails pour les notifications non encore traitées dont l'utilisateur a activé
 * l'e-mail. Le statut enregistré reflète la réponse réelle du fournisseur.
 */
export async function deliverNotificationEmails(organizationId: string) {
  const prefs = await db.notificationPreference.findMany({ where: { organizationId, email: true }, select: { userId: true, type: true } });
  if (prefs.length === 0) return { sent: 0, failed: 0 };
  const pending = await db.notification.findMany({
    where: { organizationId, emailStatus: null, OR: prefs.map((p) => ({ userId: p.userId, type: p.type })) },
    take: 200,
    select: { id: true, title: true, body: true, link: true, user: { select: { email: true } } },
  });
  let sent = 0;
  let failed = 0;
  for (const n of pending) {
    const result = await sendMail({ to: n.user.email, subject: `[EventFlow] ${n.title}`, text: `${n.title}\n\n${n.body ?? ""}\n\n${n.link ? `${process.env.APP_URL ?? ""}${n.link}` : ""}` });
    const status = result.status;
    if (status === "sent" || status === "stored") sent++;
    else failed++;
    await db.notification.update({ where: { id: n.id }, data: { emailStatus: status } });
  }
  return { sent, failed };
}
