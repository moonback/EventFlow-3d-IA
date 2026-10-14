import "server-only";
import type { EventStatus, Prisma, TaskStatus } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { zonedLocalToUtc } from "@/lib/dates";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { decimalString, money, moneyOrZero } from "@/lib/serialize";
import type { EventData, eventNoteSchema, eventTypeSchema, taskSchema, taskUpdateSchema } from "@/features/events/schemas";
import { audit, diffFields } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { nextDocumentNumber } from "./common";
import { cancelReservation } from "./reservation-service";

function toDates(data: EventData) {
  const tz = data.timezone;
  const startAt = zonedLocalToUtc(data.startLocal, tz);
  const endAt = zonedLocalToUtc(data.endLocal, tz);
  const setupStartAt = data.setupStartLocal ? zonedLocalToUtc(data.setupStartLocal, tz) : null;
  const teardownEndAt = data.teardownEndLocal ? zonedLocalToUtc(data.teardownEndLocal, tz) : null;
  if (endAt <= startAt) throw new ValidationError("La fin doit être postérieure au début", { endLocal: ["Doit être après le début"] });
  if (setupStartAt && setupStartAt > startAt) throw new ValidationError("Le montage doit commencer avant l'événement", { setupStartLocal: ["Doit précéder le début"] });
  if (teardownEndAt && teardownEndAt < endAt) throw new ValidationError("Le démontage doit finir après l'événement", { teardownEndLocal: ["Doit suivre la fin"] });
  return { startAt, endAt, setupStartAt, teardownEndAt };
}

async function assertRefs(ctx: AuthContext, data: EventData) {
  const [customer, type, manager] = await Promise.all([
    db.customer.findFirst({ where: { id: data.customerId, organizationId: ctx.organizationId }, select: { id: true } }),
    data.eventTypeId ? db.eventType.findFirst({ where: { id: data.eventTypeId, organizationId: ctx.organizationId }, select: { id: true } }) : Promise.resolve(true),
    data.managerId ? db.membership.findFirst({ where: { userId: data.managerId, organizationId: ctx.organizationId, isActive: true }, select: { id: true } }) : Promise.resolve(true),
  ]);
  if (!customer) throw new ValidationError("Client inconnu", { customerId: ["Client introuvable"] });
  if (!type) throw new ValidationError("Type d'événement inconnu", { eventTypeId: ["Type introuvable"] });
  if (!manager) throw new ValidationError("Responsable inconnu", { managerId: ["Responsable introuvable"] });
}

function persistable(data: EventData) {
  return {
    name: data.name,
    customerId: data.customerId,
    eventTypeId: data.eventTypeId,
    managerId: data.managerId,
    timezone: data.timezone,
    venueName: data.venueName,
    addressLine1: data.addressLine1,
    postalCode: data.postalCode,
    city: data.city,
    country: data.country,
    guestCount: data.guestCount,
    budgetAmount: data.budgetAmount,
    estimatedCost: data.estimatedCost,
    description: data.description,
    ...toDates(data),
  };
}

export async function createEvent(ctx: AuthContext, data: EventData) {
  assertCan(ctx, "events:write");
  await assertRefs(ctx, data);
  const values = persistable(data);
  return db.$transaction(async (tx) => {
    const reference = await nextDocumentNumber(tx, ctx.organizationId, "event", "EVT", values.startAt);
    const event = await tx.event.create({ data: { organizationId: ctx.organizationId, reference, ...values }, select: { id: true, reference: true } });
    await audit(ctx, "event.created", "Event", event.id, { reference, name: data.name }, tx);
    return event;
  });
}

export async function updateEvent(ctx: AuthContext, id: string, data: EventData) {
  assertCan(ctx, "events:write");
  const existing = await db.event.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Événement");
  if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
    throw new BusinessRuleError("EVENT_CLOSED", "Un événement terminé ou annulé ne peut plus être modifié");
  }
  await assertRefs(ctx, data);
  const values = persistable(data);
  await db.event.update({ where: { id }, data: values });
  await audit(ctx, "event.updated", "Event", id, diffFields(existing as unknown as Record<string, unknown>, values));
  return { id };
}

/** Changement de statut ; l'annulation libère les réservations non expédiées et les affectations. */
export async function changeEventStatus(ctx: AuthContext, id: string, status: EventStatus, reason: string | null) {
  assertCan(ctx, "events:write");
  const event = await db.event.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, status: true } });
  if (!event) throw new NotFoundError("Événement");
  if (event.status === "CANCELLED") throw new BusinessRuleError("EVENT_CLOSED", "Événement déjà annulé");
  if (status === "CANCELLED") {
    if (!reason) throw new ValidationError("Motif d'annulation obligatoire", { reason: ["Motif obligatoire"] });
    const reservations = await db.reservation.findMany({ where: { eventId: id, organizationId: ctx.organizationId }, select: { id: true, status: true, reference: true } });
    const out = reservations.filter((r) => r.status === "SHIPPED" || r.status === "PARTIALLY_RETURNED");
    if (out.length > 0) {
      throw new BusinessRuleError("EQUIPMENT_OUT", `Du matériel est encore sorti (${out.map((r) => r.reference).join(", ")}) : enregistrez son retour avant d'annuler`);
    }
    for (const r of reservations.filter((r) => !["CANCELLED", "RETURNED"].includes(r.status))) {
      await cancelReservation(ctx, r.id, `Événement annulé : ${reason}`);
    }
    await db.$transaction([
      db.vehicleAssignment.updateMany({ where: { eventId: id, organizationId: ctx.organizationId, status: { not: "COMPLETED" } }, data: { status: "CANCELLED" } }),
      db.eventStaffAssignment.updateMany({ where: { eventId: id, organizationId: ctx.organizationId, status: { not: "COMPLETED" } }, data: { status: "CANCELLED" } }),
    ]);
  }
  await db.event.update({ where: { id }, data: { status, cancelledReason: status === "CANCELLED" ? reason : null } });
  await audit(ctx, "event.status_changed", "Event", id, { from: event.status, to: status, reason });
  return { id, status };
}

export async function listEvents(
  ctx: AuthContext,
  query: ListQuery & { status?: EventStatus; customerId?: string; from?: Date; to?: Date; eventTypeId?: string },
) {
  assertCan(ctx, "events:read");
  const where: Prisma.EventWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.eventTypeId ? { eventTypeId: query.eventTypeId } : {}),
    ...(query.from || query.to ? { AND: [query.to ? { startAt: { lt: query.to } } : {}, query.from ? { endAt: { gt: query.from } } : {}] } : {}),
    ...(query.q
      ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { reference: { contains: query.q, mode: "insensitive" } }, { city: { contains: query.q, mode: "insensitive" } }, { customer: { name: { contains: query.q, mode: "insensitive" } } }] }
      : {}),
  };
  const sortable = { startAt: "startAt", name: "name", reference: "reference", status: "status" } as const;
  const sortField = sortable[(query.sort ?? "startAt") as keyof typeof sortable] ?? "startAt";
  const [rows, total] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: { [sortField]: query.dir },
      ...paginationArgs(query),
      select: {
        id: true,
        reference: true,
        name: true,
        status: true,
        startAt: true,
        endAt: true,
        timezone: true,
        city: true,
        venueName: true,
        customer: { select: { id: true, name: true } },
        eventType: { select: { name: true, color: true } },
        manager: { select: { name: true } },
      },
    }),
    db.event.count({ where }),
  ]);
  return paginated(rows.map((e) => ({ ...e, startAt: e.startAt.toISOString(), endAt: e.endAt.toISOString() })), total, query);
}

/** Événements d'une plage (vue calendrier). */
export async function calendarEvents(ctx: AuthContext, from: Date, to: Date) {
  assertCan(ctx, "events:read");
  const rows = await db.event.findMany({
    where: { organizationId: ctx.organizationId, startAt: { lt: to }, endAt: { gt: from } },
    orderBy: { startAt: "asc" },
    take: 500,
    select: { id: true, reference: true, name: true, status: true, startAt: true, endAt: true, setupStartAt: true, teardownEndAt: true, timezone: true, city: true, eventType: { select: { color: true, name: true } }, customer: { select: { name: true } } },
  });
  return rows.map((e) => ({ ...e, startAt: e.startAt.toISOString(), endAt: e.endAt.toISOString(), setupStartAt: e.setupStartAt?.toISOString() ?? null, teardownEndAt: e.teardownEndAt?.toISOString() ?? null }));
}

export async function getEvent(ctx: AuthContext, id: string) {
  assertCan(ctx, "events:read");
  const e = await db.event.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true, reference: true, name: true, status: true, timezone: true, startAt: true, endAt: true, setupStartAt: true, teardownEndAt: true,
      venueName: true, addressLine1: true, postalCode: true, city: true, country: true, guestCount: true, budgetAmount: true, estimatedCost: true,
      description: true, cancelledReason: true, createdAt: true, customerId: true, eventTypeId: true, managerId: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
      eventType: { select: { id: true, name: true, color: true } },
      manager: { select: { id: true, name: true } },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }], select: { id: true, title: true, status: true, priority: true, dueAt: true, assignee: { select: { id: true, firstName: true, lastName: true } } } },
      notes: { orderBy: { createdAt: "desc" }, select: { id: true, body: true, createdAt: true, authorId: true } },
      reservations: { orderBy: { createdAt: "asc" }, select: { id: true, reference: true, status: true, startAt: true, endAt: true, _count: { select: { lines: true } } } },
      vehicleAssignments: { where: { status: { not: "CANCELLED" } }, orderBy: { startAt: "asc" }, select: { id: true, status: true, startAt: true, endAt: true, purpose: true, loadWeightKg: true, vehicle: { select: { id: true, registration: true, brand: true, model: true } }, driver: { select: { id: true, firstName: true, lastName: true } } } },
      staffAssignments: { where: { status: { not: "CANCELLED" } }, orderBy: { startAt: "asc" }, select: { id: true, role: true, status: true, startAt: true, endAt: true, hourlyCost: true, declineReason: true, staff: { select: { id: true, firstName: true, lastName: true } } } },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, category: true, sizeBytes: true, createdAt: true } },
    },
  });
  if (!e) throw new NotFoundError("Événement");
  const canCosts = ctx.permissions.has("staff:costs");
  const authors = await db.user.findMany({ where: { id: { in: e.notes.map((n) => n.authorId).filter((v): v is string => Boolean(v)) } }, select: { id: true, name: true } });
  const history = await db.auditLog.findMany({
    where: { organizationId: ctx.organizationId, entityType: "Event", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, action: true, createdAt: true, changes: true, actor: { select: { name: true } } },
  });
  const [quotes, invoices, expenses] = await Promise.all([
    ctx.permissions.has("quotes:read") ? db.quote.findMany({ where: { organizationId: ctx.organizationId, eventId: id }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true, status: true, version: true, totalExclTax: true, totalInclTax: true } }) : [],
    ctx.permissions.has("invoices:read") ? db.invoice.findMany({ where: { organizationId: ctx.organizationId, eventId: id }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, kind: true, title: true, status: true, totalInclTax: true, amountPaid: true } }) : [],
    ctx.permissions.has("finance:read") ? db.expense.findMany({ where: { organizationId: ctx.organizationId, eventId: id }, orderBy: { incurredAt: "desc" }, select: { id: true, category: true, description: true, amountExclTax: true, incurredAt: true } }) : [],
  ]);
  return {
    ...e,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    setupStartAt: e.setupStartAt?.toISOString() ?? null,
    teardownEndAt: e.teardownEndAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    budgetAmount: money(e.budgetAmount),
    estimatedCost: money(e.estimatedCost),
    tasks: e.tasks.map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null })),
    notes: e.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), author: authors.find((a) => a.id === n.authorId)?.name ?? null })),
    reservations: e.reservations.map((r) => ({ id: r.id, reference: r.reference, status: r.status, startAt: r.startAt.toISOString(), endAt: r.endAt.toISOString(), lineCount: r._count.lines })),
    vehicleAssignments: e.vehicleAssignments.map((v) => ({ ...v, startAt: v.startAt.toISOString(), endAt: v.endAt.toISOString(), loadWeightKg: decimalString(v.loadWeightKg) })),
    staffAssignments: e.staffAssignments.map((s) => ({ ...s, startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString(), hourlyCost: canCosts ? money(s.hourlyCost) : null })),
    documents: e.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    quotes: quotes.map((q) => ({ ...q, totalExclTax: moneyOrZero(q.totalExclTax), totalInclTax: moneyOrZero(q.totalInclTax) })),
    invoices: invoices.map((i) => ({ ...i, totalInclTax: moneyOrZero(i.totalInclTax), amountPaid: moneyOrZero(i.amountPaid) })),
    expenses: expenses.map((x) => ({ ...x, amountExclTax: moneyOrZero(x.amountExclTax), incurredAt: x.incurredAt.toISOString() })),
    history: history.map((h) => ({ id: h.id, action: h.action, createdAt: h.createdAt.toISOString(), actor: h.actor?.name ?? null, changes: h.changes as Record<string, unknown> | null })),
  };
}

export async function eventOptions(ctx: AuthContext, opts: { includeClosed?: boolean } = {}) {
  assertCan(ctx, "events:read");
  const rows = await db.event.findMany({
    where: { organizationId: ctx.organizationId, ...(opts.includeClosed ? {} : { status: { notIn: ["CANCELLED", "COMPLETED"] } }) },
    orderBy: { startAt: "desc" },
    take: 500,
    select: { id: true, reference: true, name: true, startAt: true, customerId: true },
  });
  return rows.map((r) => ({ value: r.id, label: `${r.reference} — ${r.name}`, startAt: r.startAt.toISOString(), customerId: r.customerId }));
}

// ─── Notes ─────────────────────────────────────────────────────────────

export async function addEventNote(ctx: AuthContext, eventId: string, data: z.output<typeof eventNoteSchema>) {
  assertCan(ctx, "events:write");
  const e = await db.event.findFirst({ where: { id: eventId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!e) throw new NotFoundError("Événement");
  return db.eventNote.create({ data: { organizationId: ctx.organizationId, eventId, authorId: ctx.userId, body: data.body }, select: { id: true } });
}

// ─── Types d'événement ─────────────────────────────────────────────────

export async function listEventTypes(ctx: AuthContext) {
  assertCan(ctx, "events:read");
  return db.eventType.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true } });
}

export async function createEventType(ctx: AuthContext, data: z.output<typeof eventTypeSchema>) {
  assertCan(ctx, "settings:manage");
  const t = await db.eventType.create({ data: { organizationId: ctx.organizationId, ...data }, select: { id: true } });
  await audit(ctx, "event_type.created", "EventType", t.id, { name: data.name });
  return t;
}

// ─── Tâches ────────────────────────────────────────────────────────────

async function assertTaskRefs(ctx: AuthContext, data: { eventId?: string | null; assigneeId?: string | null }) {
  if (data.eventId) {
    const e = await db.event.findFirst({ where: { id: data.eventId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!e) throw new ValidationError("Événement inconnu", { eventId: ["Introuvable"] });
  }
  if (data.assigneeId) {
    const s = await db.staffMember.findFirst({ where: { id: data.assigneeId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!s) throw new ValidationError("Collaborateur inconnu", { assigneeId: ["Introuvable"] });
  }
}

export async function createTask(ctx: AuthContext, data: z.output<typeof taskSchema>) {
  assertCan(ctx, "tasks:write");
  await assertTaskRefs(ctx, data);
  const task = await db.eventTask.create({ data: { organizationId: ctx.organizationId, ...data }, select: { id: true } });
  await audit(ctx, "task.created", "EventTask", task.id, { title: data.title, eventId: data.eventId });
  return task;
}

export async function updateTask(ctx: AuthContext, id: string, data: z.output<typeof taskUpdateSchema>) {
  assertCan(ctx, "tasks:write");
  const task = await db.eventTask.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, status: true } });
  if (!task) throw new NotFoundError("Tâche");
  await assertTaskRefs(ctx, data);
  const completedAt = data.status === "DONE" && task.status !== "DONE" ? new Date() : data.status && data.status !== "DONE" ? null : undefined;
  await db.eventTask.update({ where: { id }, data: { ...data, ...(completedAt !== undefined ? { completedAt } : {}) } });
  if (data.status && data.status !== task.status) await audit(ctx, "task.status_changed", "EventTask", id, { from: task.status, to: data.status });
  return { id };
}

export async function listTasks(ctx: AuthContext, query: ListQuery & { status?: TaskStatus; overdue?: boolean; eventId?: string; mine?: boolean }) {
  assertCan(ctx, "events:read");
  const now = new Date();
  let assigneeFilter: Prisma.EventTaskWhereInput = {};
  if (query.mine) {
    const staff = await db.staffMember.findFirst({ where: { organizationId: ctx.organizationId, userId: ctx.userId }, select: { id: true } });
    assigneeFilter = { assigneeId: staff?.id ?? "__none__" };
  }
  const where: Prisma.EventTaskWhereInput = {
    organizationId: ctx.organizationId,
    ...assigneeFilter,
    ...(query.eventId ? { eventId: query.eventId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.overdue ? { dueAt: { lt: now }, status: { in: ["TODO", "IN_PROGRESS"] } } : {}),
    ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.eventTask.findMany({
      where,
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      ...paginationArgs(query),
      select: { id: true, title: true, description: true, status: true, priority: true, dueAt: true, event: { select: { id: true, reference: true, name: true } }, assignee: { select: { id: true, firstName: true, lastName: true } } },
    }),
    db.eventTask.count({ where }),
  ]);
  return paginated(
    rows.map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null, overdue: Boolean(t.dueAt && t.dueAt < now && (t.status === "TODO" || t.status === "IN_PROGRESS")) })),
    total,
    query,
  );
}
