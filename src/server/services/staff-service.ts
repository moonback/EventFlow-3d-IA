import "server-only";
import type { AssignmentStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { dec, round2 } from "@/lib/money";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { money } from "@/lib/serialize";
import type { skillSchema, staffAssignmentSchema, staffSchema, timesheetSchema, unavailabilitySchema } from "@/features/staff/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { withRetry } from "./common";
import { staffConflicts, type ScheduleConflict } from "./scheduling";

type StaffData = z.output<typeof staffSchema>;

async function assertStaffRefs(ctx: AuthContext, data: StaffData, staffId?: string) {
  if (data.userId) {
    const m = await db.membership.findFirst({ where: { userId: data.userId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!m) throw new ValidationError("Compte utilisateur inconnu", { userId: ["Introuvable"] });
    const linked = await db.staffMember.findFirst({ where: { organizationId: ctx.organizationId, userId: data.userId, ...(staffId ? { id: { not: staffId } } : {}) }, select: { id: true } });
    if (linked) throw new ValidationError("Ce compte est déjà lié à un autre collaborateur", { userId: ["Déjà lié"] });
  }
  if (data.skillIds.length) {
    const n = await db.skill.count({ where: { organizationId: ctx.organizationId, id: { in: data.skillIds } } });
    if (n !== new Set(data.skillIds).size) throw new ValidationError("Compétence inconnue", { skillIds: ["Introuvable"] });
  }
}

export async function listStaff(ctx: AuthContext, query: ListQuery & { active?: boolean; skillId?: string }) {
  assertCan(ctx, "staff:read");
  const where: Prisma.StaffMemberWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.active === undefined ? {} : { isActive: query.active }),
    ...(query.skillId ? { skills: { some: { skillId: query.skillId } } } : {}),
    ...(query.q ? { OR: [{ firstName: { contains: query.q, mode: "insensitive" } }, { lastName: { contains: query.q, mode: "insensitive" } }, { jobTitle: { contains: query.q, mode: "insensitive" } }] } : {}),
  };
  const canCosts = ctx.permissions.has("staff:costs");
  const now = new Date();
  const [rows, total] = await Promise.all([
    db.staffMember.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      ...paginationArgs(query),
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, jobTitle: true, employmentType: true, isActive: true, hourlyCost: true,
        skills: { select: { skill: { select: { id: true, name: true } } } },
        assignments: { where: { status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] }, endAt: { gt: now } }, orderBy: { startAt: "asc" }, take: 1, select: { startAt: true, event: { select: { reference: true, name: true } } } },
      },
    }),
    db.staffMember.count({ where }),
  ]);
  return paginated(
    rows.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      email: s.email,
      phone: s.phone,
      jobTitle: s.jobTitle,
      employmentType: s.employmentType,
      isActive: s.isActive,
      hourlyCost: canCosts ? money(s.hourlyCost) : null,
      skills: s.skills.map((k) => k.skill),
      nextAssignment: s.assignments[0] ? { startAt: s.assignments[0].startAt.toISOString(), event: s.assignments[0].event } : null,
    })),
    total,
    query,
  );
}

export async function getStaffMember(ctx: AuthContext, id: string) {
  assertCan(ctx, "staff:read");
  const s = await db.staffMember.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true, jobTitle: true, employmentType: true, hourlyCost: true, dailyCost: true,
      drivingLicenses: true, isActive: true, notes: true, userId: true,
      user: { select: { name: true, email: true } },
      skills: { select: { level: true, skill: { select: { id: true, name: true } } } },
      availabilities: { orderBy: { startAt: "desc" }, take: 50, select: { id: true, kind: true, declaredViaPortal: true, startAt: true, endAt: true, reason: true } },
      assignments: {
        orderBy: { startAt: "desc" },
        take: 100,
        select: { id: true, role: true, status: true, startAt: true, endAt: true, hourlyCost: true, event: { select: { id: true, reference: true, name: true, timezone: true } }, timesheets: { select: { hours: true } } },
      },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, category: true, sizeBytes: true, createdAt: true } },
      portalTokens: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: { sort: "desc", nulls: "last" } }, select: { lastUsedAt: true } },
    },
  });
  if (!s) throw new NotFoundError("Collaborateur");
  const canCosts = ctx.permissions.has("staff:costs");
  const { portalTokens, ...rest } = s;
  return {
    ...rest,
    hourlyCost: canCosts ? money(s.hourlyCost) : null,
    dailyCost: canCosts ? money(s.dailyCost) : null,
    availabilities: s.availabilities.map((a) => ({ ...a, startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString() })),
    assignments: s.assignments.map((a) => ({
      id: a.id,
      role: a.role,
      status: a.status,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      event: a.event,
      hourlyCost: canCosts ? money(a.hourlyCost) : null,
      plannedHours: round2((a.endAt.getTime() - a.startAt.getTime()) / 3_600_000).toFixed(2),
      workedHours: a.timesheets.reduce((acc, t) => acc.plus(t.hours), dec(0)).toFixed(2),
    })),
    documents: s.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    portal: { activeLinks: portalTokens.length, lastUsedAt: portalTokens[0]?.lastUsedAt?.toISOString() ?? null },
  };
}

export async function createStaffMember(ctx: AuthContext, data: StaffData) {
  assertCan(ctx, "staff:write");
  await assertStaffRefs(ctx, data);
  const { skillIds, ...rest } = data;
  const s = await db.staffMember.create({
    data: { organizationId: ctx.organizationId, ...rest, skills: { create: skillIds.map((skillId) => ({ skillId })) } },
    select: { id: true },
  });
  await audit(ctx, "staff.created", "StaffMember", s.id, { name: `${data.firstName} ${data.lastName}` });
  return s;
}

export async function updateStaffMember(ctx: AuthContext, id: string, data: StaffData) {
  assertCan(ctx, "staff:write");
  const existing = await db.staffMember.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
  if (!existing) throw new NotFoundError("Collaborateur");
  await assertStaffRefs(ctx, data, id);
  const { skillIds, ...rest } = data;
  await db.$transaction([
    db.staffSkill.deleteMany({ where: { staffId: id } }),
    db.staffMember.update({ where: { id }, data: { ...rest, skills: { create: skillIds.map((skillId) => ({ skillId })) } } }),
  ]);
  await audit(ctx, "staff.updated", "StaffMember", id, { isActive: data.isActive });
  return { id };
}

export async function listSkills(ctx: AuthContext) {
  assertCan(ctx, "staff:read");
  return db.skill.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function createSkill(ctx: AuthContext, data: z.output<typeof skillSchema>) {
  assertCan(ctx, "staff:write");
  return db.skill.create({ data: { organizationId: ctx.organizationId, name: data.name }, select: { id: true, name: true } });
}

export async function addUnavailability(ctx: AuthContext, staffId: string, data: z.output<typeof unavailabilitySchema>) {
  assertCan(ctx, "staff:write");
  const s = await db.staffMember.findFirst({ where: { id: staffId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!s) throw new NotFoundError("Collaborateur");
  return db.staffAvailability.create({ data: { organizationId: ctx.organizationId, staffId, ...data }, select: { id: true } });
}

export async function deleteUnavailability(ctx: AuthContext, id: string) {
  assertCan(ctx, "staff:write");
  const r = await db.staffAvailability.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count === 0) throw new NotFoundError("Indisponibilité");
}

export async function staffOptions(ctx: AuthContext) {
  assertCan(ctx, "staff:read");
  const rows = await db.staffMember.findMany({ where: { organizationId: ctx.organizationId, isActive: true }, orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true, jobTitle: true, drivingLicenses: true, employmentType: true } });
  return rows.map((r) => ({ value: r.id, label: `${r.firstName} ${r.lastName}${r.jobTitle ? ` — ${r.jobTitle}` : ""}`, drivingLicenses: r.drivingLicenses, employmentType: r.employmentType }));
}

type AssignmentData = z.output<typeof staffAssignmentSchema>;

async function collectConflicts(tx: Prisma.TransactionClient, ctx: AuthContext, data: AssignmentData, excludeId?: string) {
  const { staff, conflicts } = await staffConflicts(tx, ctx.organizationId, data.staffId, data.startAt, data.endAt, { staffAssignmentId: excludeId });
  if (!staff) throw new NotFoundError("Collaborateur");
  const all: ScheduleConflict[] = [...conflicts];
  if (data.requiredSkillId) {
    const skill = await tx.skill.findFirst({ where: { id: data.requiredSkillId, organizationId: ctx.organizationId }, select: { name: true } });
    if (!skill) throw new ValidationError("Compétence inconnue", { requiredSkillId: ["Introuvable"] });
    if (!staff.skills.some((s) => s.skillId === data.requiredSkillId)) {
      all.push({ kind: "SKILL_MISSING", message: `Compétence requise non détenue : ${skill.name}` });
    }
  }
  return all;
}

export async function previewStaffAssignment(ctx: AuthContext, data: AssignmentData) {
  assertCan(ctx, "staff:read");
  return { conflicts: await collectConflicts(db, ctx, data) };
}

/** Affectation d'un collaborateur : verrou sur le collaborateur, contrôle disponibilité / compétences. */
export async function createStaffAssignment(ctx: AuthContext, data: AssignmentData) {
  assertCan(ctx, "staff:assign");
  return withRetry(async (tx) => {
    const event = await tx.event.findFirst({ where: { id: data.eventId, organizationId: ctx.organizationId }, select: { id: true, status: true } });
    if (!event) throw new NotFoundError("Événement");
    if (event.status === "CANCELLED") throw new BusinessRuleError("EVENT_CANCELLED", "L'événement est annulé");
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "StaffMember" WHERE "id" = ${data.staffId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Collaborateur");
    const conflicts = await collectConflicts(tx, ctx, data);
    if (conflicts.length > 0) throw new BusinessRuleError("SCHEDULE_CONFLICT", conflicts.map((c) => c.message).join(" · "), { conflicts });
    const staff = await tx.staffMember.findUniqueOrThrow({ where: { id: data.staffId }, select: { hourlyCost: true } });
    const { propose, ...fields } = data;
    const a = await tx.eventStaffAssignment.create({
      data: { organizationId: ctx.organizationId, ...fields, status: propose ? "PROPOSED" : "PLANNED", hourlyCost: staff.hourlyCost },
      select: { id: true },
    });
    await audit(ctx, propose ? "staff.mission_proposed" : "staff.assigned", "EventStaffAssignment", a.id, { staffId: data.staffId, eventId: data.eventId, role: data.role }, tx);
    return a;
  });
}

export async function setStaffAssignmentStatus(ctx: AuthContext, id: string, status: AssignmentStatus) {
  assertCan(ctx, "staff:assign");
  const a = await db.eventStaffAssignment.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { status: true } });
  if (!a) throw new NotFoundError("Affectation");
  if (a.status === "CANCELLED") throw new BusinessRuleError("ASSIGNMENT_CLOSED", "Affectation annulée");
  if (a.status === "DECLINED") throw new BusinessRuleError("ASSIGNMENT_DECLINED", "Mission refusée par le prestataire : créez une nouvelle proposition");
  if (a.status === "PROPOSED" && status !== "CANCELLED") throw new BusinessRuleError("AWAITING_RESPONSE", "Mission en attente de la réponse du prestataire : seule l'annulation est possible");
  await db.eventStaffAssignment.update({ where: { id }, data: { status } });
  await audit(ctx, "staff.assignment_status", "EventStaffAssignment", id, { from: a.status, to: status });
  return { id, status };
}

/** Relevé d'heures réalisées sur une affectation. */
export async function addTimesheet(ctx: AuthContext, assignmentId: string, data: z.output<typeof timesheetSchema>) {
  assertCan(ctx, "staff:assign");
  const a = await db.eventStaffAssignment.findFirst({ where: { id: assignmentId, organizationId: ctx.organizationId }, select: { id: true, staffId: true, status: true } });
  if (!a) throw new NotFoundError("Affectation");
  if (a.status === "CANCELLED") throw new BusinessRuleError("ASSIGNMENT_CLOSED", "Affectation annulée");
  if (a.status === "PROPOSED" || a.status === "DECLINED") throw new BusinessRuleError("ASSIGNMENT_NOT_CONFIRMED", "Mission non acceptée par le prestataire");
  const t = await db.timesheet.create({ data: { organizationId: ctx.organizationId, assignmentId, staffId: a.staffId, workDate: data.workDate, hours: data.hours, notes: data.notes }, select: { id: true } });
  await audit(ctx, "staff.timesheet_added", "EventStaffAssignment", assignmentId, { hours: data.hours });
  return t;
}

/** Planning du personnel (affectations + indisponibilités) sur une période. */
export async function staffSchedule(ctx: AuthContext, from: Date, to: Date) {
  assertCan(ctx, "staff:read");
  const rows = await db.staffMember.findMany({
    where: { organizationId: ctx.organizationId, isActive: true },
    orderBy: [{ lastName: "asc" }],
    select: {
      id: true, firstName: true, lastName: true, jobTitle: true,
      assignments: { where: { status: { notIn: ["CANCELLED", "DECLINED"] }, startAt: { lt: to }, endAt: { gt: from } }, select: { id: true, role: true, status: true, startAt: true, endAt: true, event: { select: { id: true, reference: true, name: true } } } },
      vehicleAssignments: { where: { status: { not: "CANCELLED" }, startAt: { lt: to }, endAt: { gt: from } }, select: { id: true, startAt: true, endAt: true, vehicle: { select: { registration: true } }, event: { select: { id: true, reference: true } } } },
      availabilities: { where: { startAt: { lt: to }, endAt: { gt: from } }, select: { id: true, kind: true, startAt: true, endAt: true, reason: true } },
    },
  });
  return rows.map((r) => {
    const items = [
      ...r.assignments.map((a) => ({ id: a.id, kind: a.status === "PROPOSED" ? ("proposal" as const) : ("assignment" as const), label: `${a.event.reference} · ${a.role}${a.status === "PROPOSED" ? " (proposée)" : ""}`, eventId: a.event.id, start: a.startAt, end: a.endAt })),
      ...r.vehicleAssignments.map((v) => ({ id: v.id, kind: "driving" as const, label: `Conduite ${v.vehicle.registration} · ${v.event.reference}`, eventId: v.event.id, start: v.startAt, end: v.endAt })),
      ...r.availabilities.map((u) => ({ id: u.id, kind: u.kind === "AVAILABLE" ? ("available" as const) : ("unavailable" as const), label: u.reason ?? (u.kind === "AVAILABLE" ? "Disponible" : "Indisponible"), eventId: null, start: u.startAt, end: u.endAt })),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());
    // Conflits : deux éléments bloquants qui se chevauchent (une disponibilité déclarée n'est jamais en conflit)
    const blocking = items.filter((it) => it.kind !== "available");
    const conflictIds = new Set<string>();
    for (let i = 0; i < blocking.length; i++) {
      for (let j = i + 1; j < blocking.length; j++) {
        if (blocking[j]!.start < blocking[i]!.end) {
          conflictIds.add(blocking[i]!.id);
          conflictIds.add(blocking[j]!.id);
        }
      }
    }
    return {
      id: r.id,
      name: `${r.firstName} ${r.lastName}`,
      jobTitle: r.jobTitle,
      items: items.map((it) => ({ ...it, start: it.start.toISOString(), end: it.end.toISOString(), conflict: conflictIds.has(it.id) })),
    };
  });
}
