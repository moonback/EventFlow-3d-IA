import "server-only";
import type { AssignmentStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import type { VehicleOpsStatus } from "@/lib/labels";
import { dec } from "@/lib/money";
import { paginated, type ListQuery } from "@/lib/pagination";
import { decimalString, money } from "@/lib/serialize";
import type { vehicleAssignmentSchema, vehicleMaintenanceSchema, vehicleSchema } from "@/features/vehicles/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { withRetry } from "./common";
import { staffConflicts, vehicleConflicts, type ScheduleConflict } from "./scheduling";

const DAY = 86_400_000;

interface OpsInput {
  status: string;
  assignments: { startAt: Date; endAt: Date; status: AssignmentStatus }[];
  maintenances: { scheduledAt: Date; completedAt: Date | null; blocksVehicle: boolean }[];
}

/** Statut opérationnel calculé à partir du statut administratif, des entretiens et des affectations. */
export function vehicleOpsStatus(v: OpsInput, now = new Date()): VehicleOpsStatus {
  if (v.status === "RETIRED" || v.status === "UNAVAILABLE") return "UNAVAILABLE";
  if (v.status === "MAINTENANCE") return "MAINTENANCE";
  const inMaintenance = v.maintenances.some((m) => m.blocksVehicle && m.scheduledAt <= now && (m.completedAt ?? new Date(m.scheduledAt.getTime() + DAY)) > now);
  if (inMaintenance) return "MAINTENANCE";
  const active = v.assignments.filter((a) => a.status !== "CANCELLED" && a.status !== "COMPLETED");
  if (active.some((a) => a.startAt <= now && a.endAt > now)) return "ON_MISSION";
  if (active.some((a) => a.startAt > now && a.startAt.getTime() - now.getTime() < 7 * DAY)) return "ASSIGNED";
  return "AVAILABLE";
}

/** Alertes administratives : assurance, contrôle technique, entretien (à 30 jours). */
export function vehicleAlerts(v: { insuranceExpiresAt: Date | null; inspectionDueAt: Date | null; nextServiceAt: Date | null; nextServiceKm: number | null; mileageKm: number }, now = new Date()) {
  const alerts: { level: "warning" | "danger"; message: string }[] = [];
  const check = (date: Date | null, label: string) => {
    if (!date) return;
    if (date < now) alerts.push({ level: "danger", message: `${label} dépassé(e) depuis le ${date.toLocaleDateString("fr-FR")}` });
    else if (date.getTime() - now.getTime() < 30 * DAY) alerts.push({ level: "warning", message: `${label} à échéance le ${date.toLocaleDateString("fr-FR")}` });
  };
  check(v.insuranceExpiresAt, "Assurance");
  check(v.inspectionDueAt, "Contrôle technique");
  check(v.nextServiceAt, "Entretien");
  if (v.nextServiceKm !== null && v.mileageKm >= v.nextServiceKm) alerts.push({ level: "danger", message: `Entretien kilométrique dépassé (${v.nextServiceKm} km)` });
  else if (v.nextServiceKm !== null && v.nextServiceKm - v.mileageKm < 1000) alerts.push({ level: "warning", message: `Entretien dans moins de 1 000 km` });
  return alerts;
}

const opsSelect = {
  assignments: { where: { status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] } }, select: { startAt: true, endAt: true, status: true }, orderBy: { startAt: "asc" } },
  maintenances: { where: { completedAt: null }, select: { scheduledAt: true, completedAt: true, blocksVehicle: true } },
} satisfies Prisma.VehicleSelect;

export async function listVehicles(ctx: AuthContext, query: ListQuery & { ops?: VehicleOpsStatus }) {
  assertCan(ctx, "vehicles:read");
  const where: Prisma.VehicleWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.q ? { OR: [{ registration: { contains: query.q, mode: "insensitive" } }, { brand: { contains: query.q, mode: "insensitive" } }, { model: { contains: query.q, mode: "insensitive" } }] } : {}),
  };
  const rows = await db.vehicle.findMany({
    where,
    orderBy: { registration: "asc" },
    select: {
      id: true, registration: true, brand: true, model: true, type: true, status: true, payloadKg: true, volumeM3: true, mileageKm: true,
      insuranceExpiresAt: true, inspectionDueAt: true, nextServiceAt: true, nextServiceKm: true,
      ...opsSelect,
    },
  });
  const now = new Date();
  const mapped = rows.map((v) => ({
    id: v.id,
    registration: v.registration,
    brand: v.brand,
    model: v.model,
    type: v.type,
    status: v.status,
    payloadKg: v.payloadKg,
    volumeM3: decimalString(v.volumeM3),
    mileageKm: v.mileageKm,
    ops: vehicleOpsStatus(v, now),
    alerts: vehicleAlerts(v, now),
    nextAssignment: v.assignments.find((a) => a.endAt > now)?.startAt.toISOString() ?? null,
  }));
  const filtered = query.ops ? mapped.filter((m) => m.ops === query.ops) : mapped;
  const start = (query.page - 1) * query.pageSize;
  return paginated(filtered.slice(start, start + query.pageSize), filtered.length, query);
}

export async function getVehicle(ctx: AuthContext, id: string) {
  assertCan(ctx, "vehicles:read");
  const v = await db.vehicle.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true, registration: true, brand: true, model: true, type: true, status: true, payloadKg: true, volumeM3: true, mileageKm: true, requiredLicense: true,
      insuranceExpiresAt: true, inspectionDueAt: true, nextServiceAt: true, nextServiceKm: true, dailyCost: true, costPerKm: true, notes: true,
      assignments: {
        orderBy: { startAt: "desc" },
        take: 100,
        select: { id: true, status: true, startAt: true, endAt: true, purpose: true, loadWeightKg: true, loadVolumeM3: true, distanceKm: true, event: { select: { id: true, reference: true, name: true, timezone: true } }, driver: { select: { id: true, firstName: true, lastName: true } } },
      },
      maintenances: { orderBy: { scheduledAt: "desc" }, select: { id: true, title: true, scheduledAt: true, completedAt: true, mileageKm: true, cost: true, notes: true, blocksVehicle: true } },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, category: true, sizeBytes: true, createdAt: true } },
      expenses: { orderBy: { incurredAt: "desc" }, take: 50, select: { id: true, category: true, description: true, amountExclTax: true, incurredAt: true } },
    },
  });
  if (!v) throw new NotFoundError("Véhicule");
  const canCosts = ctx.permissions.has("finance:read") || ctx.permissions.has("vehicles:write");
  return {
    ...v,
    volumeM3: decimalString(v.volumeM3),
    dailyCost: canCosts ? money(v.dailyCost) : null,
    costPerKm: canCosts ? decimalString(v.costPerKm) : null,
    insuranceExpiresAt: v.insuranceExpiresAt?.toISOString() ?? null,
    inspectionDueAt: v.inspectionDueAt?.toISOString() ?? null,
    nextServiceAt: v.nextServiceAt?.toISOString() ?? null,
    ops: vehicleOpsStatus({ status: v.status, assignments: v.assignments, maintenances: v.maintenances.filter((m) => !m.completedAt) }),
    alerts: vehicleAlerts(v),
    assignments: v.assignments.map((a) => ({ ...a, startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString(), loadWeightKg: decimalString(a.loadWeightKg), loadVolumeM3: decimalString(a.loadVolumeM3) })),
    maintenances: v.maintenances.map((m) => ({ ...m, scheduledAt: m.scheduledAt.toISOString(), completedAt: m.completedAt?.toISOString() ?? null, cost: canCosts ? money(m.cost) : null })),
    documents: v.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    expenses: canCosts ? v.expenses.map((e) => ({ ...e, amountExclTax: money(e.amountExclTax)!, incurredAt: e.incurredAt.toISOString() })) : [],
  };
}

export async function createVehicle(ctx: AuthContext, data: z.output<typeof vehicleSchema>) {
  assertCan(ctx, "vehicles:write");
  const v = await db.vehicle.create({ data: { organizationId: ctx.organizationId, ...data }, select: { id: true } });
  await audit(ctx, "vehicle.created", "Vehicle", v.id, { registration: data.registration });
  return v;
}

export async function updateVehicle(ctx: AuthContext, id: string, data: z.output<typeof vehicleSchema>) {
  assertCan(ctx, "vehicles:write");
  const r = await db.vehicle.updateMany({ where: { id, organizationId: ctx.organizationId }, data });
  if (r.count === 0) throw new NotFoundError("Véhicule");
  await audit(ctx, "vehicle.updated", "Vehicle", id, { registration: data.registration, status: data.status });
  return { id };
}

export async function vehicleOptions(ctx: AuthContext) {
  assertCan(ctx, "vehicles:read");
  const rows = await db.vehicle.findMany({ where: { organizationId: ctx.organizationId, status: { not: "RETIRED" } }, orderBy: { registration: "asc" }, select: { id: true, registration: true, brand: true, model: true, payloadKg: true } });
  return rows.map((r) => ({ value: r.id, label: `${r.registration} — ${r.brand} ${r.model}${r.payloadKg ? ` (${r.payloadKg} kg)` : ""}` }));
}

/** Charge estimée d'un événement : somme poids/volume du matériel réservé (non annulé). */
export async function estimateEventLoad(tx: Tx, organizationId: string, eventId: string) {
  const lines = await tx.reservationLine.findMany({
    where: { reservation: { organizationId, eventId, status: { notIn: ["CANCELLED", "RETURNED"] } } },
    select: { quantity: true, product: { select: { weightKg: true, volumeM3: true } } },
  });
  let weight = dec(0);
  let volume = dec(0);
  let missingData = 0;
  for (const l of lines) {
    if (l.product.weightKg) weight = weight.plus(dec(l.product.weightKg).mul(l.quantity));
    else missingData++;
    if (l.product.volumeM3) volume = volume.plus(dec(l.product.volumeM3).mul(l.quantity));
  }
  return { weightKg: weight.toFixed(2), volumeM3: volume.toFixed(3), linesWithoutWeight: missingData };
}

export async function getEventLoad(ctx: AuthContext, eventId: string) {
  assertCan(ctx, "vehicles:read");
  const e = await db.event.findFirst({ where: { id: eventId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!e) throw new NotFoundError("Événement");
  return estimateEventLoad(db, ctx.organizationId, eventId);
}

type AssignmentData = z.output<typeof vehicleAssignmentSchema>;

async function collectAssignmentConflicts(tx: Tx, ctx: AuthContext, data: AssignmentData, excludeId?: string) {
  const { vehicle, conflicts } = await vehicleConflicts(tx, ctx.organizationId, data.vehicleId, data.startAt, data.endAt, excludeId);
  if (!vehicle) throw new NotFoundError("Véhicule");
  const v = await tx.vehicle.findUniqueOrThrow({ where: { id: data.vehicleId }, select: { payloadKg: true, volumeM3: true, requiredLicense: true } });
  const all: ScheduleConflict[] = [...conflicts];
  if (data.driverId) {
    const { staff, conflicts: driverConflicts } = await staffConflicts(tx, ctx.organizationId, data.driverId, data.startAt, data.endAt, { vehicleAssignmentId: excludeId });
    if (!staff) throw new ValidationError("Chauffeur inconnu", { driverId: ["Introuvable"] });
    all.push(...driverConflicts);
    if (v.requiredLicense) {
      const licenses = (staff.drivingLicenses ?? "").toUpperCase().split(/[\s,;]+/).filter(Boolean);
      if (!licenses.includes(v.requiredLicense.toUpperCase())) {
        all.push({ kind: "LICENSE_MISSING", message: `Permis ${v.requiredLicense} requis (chauffeur : ${licenses.join(", ") || "aucun permis renseigné"})` });
      }
    }
  }
  if (data.loadWeightKg && v.payloadKg && dec(data.loadWeightKg).gt(v.payloadKg)) {
    all.push({ kind: "CAPACITY_WEIGHT", message: `Charge ${data.loadWeightKg} kg > charge utile ${v.payloadKg} kg` });
  }
  if (data.loadVolumeM3 && v.volumeM3 && dec(data.loadVolumeM3).gt(dec(v.volumeM3))) {
    all.push({ kind: "CAPACITY_VOLUME", message: `Volume ${data.loadVolumeM3} m³ > volume utile ${v.volumeM3.toString()} m³` });
  }
  return all;
}

/** Aperçu des conflits avant affectation (affichage dans l'interface). */
export async function previewVehicleAssignment(ctx: AuthContext, data: AssignmentData) {
  assertCan(ctx, "vehicles:read");
  const event = await db.event.findFirst({ where: { id: data.eventId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!event) throw new NotFoundError("Événement");
  const conflicts = await collectAssignmentConflicts(db, ctx, data);
  const load = await estimateEventLoad(db, ctx.organizationId, data.eventId);
  return { conflicts, estimatedLoad: load };
}

/** Affectation d'un véhicule : verrou du véhicule (et du chauffeur) puis contrôle des conflits. */
export async function createVehicleAssignment(ctx: AuthContext, data: AssignmentData) {
  assertCan(ctx, "vehicles:assign");
  return withRetry(async (tx) => {
    const event = await tx.event.findFirst({ where: { id: data.eventId, organizationId: ctx.organizationId }, select: { id: true, status: true, reference: true } });
    if (!event) throw new NotFoundError("Événement");
    if (event.status === "CANCELLED") throw new BusinessRuleError("EVENT_CANCELLED", "L'événement est annulé");
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Vehicle" WHERE "id" = ${data.vehicleId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Véhicule");
    if (data.driverId) await tx.$queryRaw`SELECT "id" FROM "StaffMember" WHERE "id" = ${data.driverId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const conflicts = await collectAssignmentConflicts(tx, ctx, data);
    if (conflicts.length > 0) {
      throw new BusinessRuleError("SCHEDULE_CONFLICT", conflicts.map((c) => c.message).join(" · "), { conflicts });
    }
    const assignment = await tx.vehicleAssignment.create({ data: { organizationId: ctx.organizationId, ...data }, select: { id: true } });
    await audit(ctx, "vehicle.assigned", "VehicleAssignment", assignment.id, { vehicleId: data.vehicleId, eventId: data.eventId, driverId: data.driverId }, tx);
    return assignment;
  });
}

export async function setVehicleAssignmentStatus(ctx: AuthContext, id: string, status: AssignmentStatus) {
  assertCan(ctx, "vehicles:assign");
  const a = await db.vehicleAssignment.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { status: true } });
  if (!a) throw new NotFoundError("Affectation");
  if (a.status === "CANCELLED" || a.status === "COMPLETED") throw new BusinessRuleError("ASSIGNMENT_CLOSED", "Affectation clôturée");
  await db.vehicleAssignment.update({ where: { id }, data: { status } });
  await audit(ctx, "vehicle.assignment_status", "VehicleAssignment", id, { from: a.status, to: status });
  return { id, status };
}

export async function addVehicleMaintenance(ctx: AuthContext, vehicleId: string, data: z.output<typeof vehicleMaintenanceSchema>) {
  assertCan(ctx, "vehicles:write");
  const v = await db.vehicle.findFirst({ where: { id: vehicleId, organizationId: ctx.organizationId }, select: { id: true, mileageKm: true } });
  if (!v) throw new NotFoundError("Véhicule");
  return db.$transaction(async (tx) => {
    const m = await tx.vehicleMaintenance.create({ data: { organizationId: ctx.organizationId, vehicleId, ...data }, select: { id: true } });
    if (data.completedAt && data.cost) {
      await tx.expense.create({ data: { organizationId: ctx.organizationId, category: "MAINTENANCE", description: `Entretien véhicule : ${data.title}`, amountExclTax: data.cost, incurredAt: data.completedAt, vehicleId, createdById: ctx.userId } });
    }
    if (data.mileageKm && data.mileageKm > v.mileageKm) await tx.vehicle.update({ where: { id: vehicleId }, data: { mileageKm: data.mileageKm } });
    await audit(ctx, "vehicle.maintenance_added", "Vehicle", vehicleId, { title: data.title }, tx);
    return m;
  });
}

export async function completeVehicleMaintenance(ctx: AuthContext, maintenanceId: string, input: { cost: string | null; mileageKm: number | null }) {
  assertCan(ctx, "vehicles:write");
  const m = await db.vehicleMaintenance.findFirst({ where: { id: maintenanceId, organizationId: ctx.organizationId }, select: { id: true, vehicleId: true, completedAt: true, title: true } });
  if (!m) throw new NotFoundError("Entretien");
  if (m.completedAt) throw new BusinessRuleError("ALREADY_DONE", "Entretien déjà terminé");
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.vehicleMaintenance.update({ where: { id: m.id }, data: { completedAt: now, cost: input.cost, mileageKm: input.mileageKm } });
    if (input.cost) await tx.expense.create({ data: { organizationId: ctx.organizationId, category: "MAINTENANCE", description: `Entretien véhicule : ${m.title}`, amountExclTax: input.cost, incurredAt: now, vehicleId: m.vehicleId, createdById: ctx.userId } });
    if (input.mileageKm) await tx.vehicle.updateMany({ where: { id: m.vehicleId, mileageKm: { lt: input.mileageKm } }, data: { mileageKm: input.mileageKm } });
  });
  await audit(ctx, "vehicle.maintenance_completed", "Vehicle", m.vehicleId, { maintenanceId });
  return { id: m.id };
}

/** Planning des véhicules sur une période (vue calendrier). */
export async function vehicleSchedule(ctx: AuthContext, from: Date, to: Date) {
  assertCan(ctx, "vehicles:read");
  const vehicles = await db.vehicle.findMany({
    where: { organizationId: ctx.organizationId, status: { not: "RETIRED" } },
    orderBy: { registration: "asc" },
    select: {
      id: true, registration: true, brand: true, model: true,
      assignments: { where: { status: { not: "CANCELLED" }, startAt: { lt: to }, endAt: { gt: from } }, select: { id: true, startAt: true, endAt: true, status: true, event: { select: { id: true, reference: true, name: true } } } },
      maintenances: { where: { scheduledAt: { lt: to } }, select: { id: true, title: true, scheduledAt: true, completedAt: true } },
    },
  });
  return vehicles.map((v) => ({
    ...v,
    assignments: v.assignments.map((a) => ({ ...a, startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString() })),
    maintenances: v.maintenances
      .map((m) => ({ ...m, start: m.scheduledAt, end: m.completedAt ?? new Date(m.scheduledAt.getTime() + DAY) }))
      .filter((m) => m.end > from)
      .map((m) => ({ id: m.id, title: m.title, startAt: m.start.toISOString(), endAt: m.end.toISOString() })),
  }));
}
