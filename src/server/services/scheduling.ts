import "server-only";
import type { Tx } from "@/lib/db";

/**
 * Détection des conflits de planification (véhicules et personnel).
 * Intervalles semi-ouverts : [début, fin). Les affectations annulées, refusées ou terminées ne bloquent pas.
 * Une proposition en attente (PROPOSED) bloque le créneau ; une disponibilité déclarée (AVAILABLE) ne bloque rien.
 */
export interface ScheduleConflict {
  kind: "VEHICLE_ASSIGNMENT" | "VEHICLE_MAINTENANCE" | "VEHICLE_STATUS" | "STAFF_ASSIGNMENT" | "STAFF_DRIVING" | "STAFF_UNAVAILABLE" | "STAFF_INACTIVE" | "SKILL_MISSING" | "LICENSE_MISSING" | "CAPACITY_WEIGHT" | "CAPACITY_VOLUME";
  message: string;
  start?: string;
  end?: string;
  reference?: string;
}

const ACTIVE = ["PROPOSED", "PLANNED", "CONFIRMED", "IN_PROGRESS"] as const;

export async function vehicleConflicts(tx: Tx, organizationId: string, vehicleId: string, start: Date, end: Date, excludeAssignmentId?: string) {
  const conflicts: ScheduleConflict[] = [];
  const vehicle = await tx.vehicle.findFirst({ where: { id: vehicleId, organizationId }, select: { status: true, registration: true } });
  if (!vehicle) return { vehicle: null, conflicts };
  if (vehicle.status !== "AVAILABLE") {
    conflicts.push({ kind: "VEHICLE_STATUS", message: `Le véhicule ${vehicle.registration} est hors service (${vehicle.status})` });
  }
  const assignments = await tx.vehicleAssignment.findMany({
    where: { organizationId, vehicleId, status: { in: [...ACTIVE] }, startAt: { lt: end }, endAt: { gt: start }, ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}) },
    select: { startAt: true, endAt: true, event: { select: { reference: true, name: true } } },
  });
  for (const a of assignments) {
    conflicts.push({ kind: "VEHICLE_ASSIGNMENT", message: `Déjà affecté à ${a.event.reference} — ${a.event.name}`, start: a.startAt.toISOString(), end: a.endAt.toISOString(), reference: a.event.reference });
  }
  const maintenances = await tx.vehicleMaintenance.findMany({
    where: { organizationId, vehicleId, blocksVehicle: true, scheduledAt: { lt: end } },
    select: { title: true, scheduledAt: true, completedAt: true },
  });
  for (const m of maintenances) {
    const mEnd = m.completedAt ?? new Date(m.scheduledAt.getTime() + 86_400_000);
    if (mEnd > start) conflicts.push({ kind: "VEHICLE_MAINTENANCE", message: `Entretien prévu : ${m.title}`, start: m.scheduledAt.toISOString(), end: mEnd.toISOString() });
  }
  return { vehicle, conflicts };
}

/** Conflits d'un collaborateur : autres missions, conduites, indisponibilités déclarées, statut. */
export async function staffConflicts(
  tx: Tx,
  organizationId: string,
  staffId: string,
  start: Date,
  end: Date,
  exclude: { staffAssignmentId?: string; vehicleAssignmentId?: string } = {},
) {
  const conflicts: ScheduleConflict[] = [];
  const staff = await tx.staffMember.findFirst({
    where: { id: staffId, organizationId },
    select: { isActive: true, firstName: true, lastName: true, drivingLicenses: true, skills: { select: { skillId: true, skill: { select: { name: true } } } } },
  });
  if (!staff) return { staff: null, conflicts };
  if (!staff.isActive) conflicts.push({ kind: "STAFF_INACTIVE", message: `${staff.firstName} ${staff.lastName} est inactif` });
  const [assignments, driving, unavailable] = await Promise.all([
    tx.eventStaffAssignment.findMany({
      where: { organizationId, staffId, status: { in: [...ACTIVE] }, startAt: { lt: end }, endAt: { gt: start }, ...(exclude.staffAssignmentId ? { id: { not: exclude.staffAssignmentId } } : {}) },
      select: { startAt: true, endAt: true, role: true, event: { select: { reference: true, name: true } } },
    }),
    tx.vehicleAssignment.findMany({
      where: { organizationId, driverId: staffId, status: { in: [...ACTIVE] }, startAt: { lt: end }, endAt: { gt: start }, ...(exclude.vehicleAssignmentId ? { id: { not: exclude.vehicleAssignmentId } } : {}) },
      select: { startAt: true, endAt: true, event: { select: { reference: true, name: true } }, vehicle: { select: { registration: true } } },
    }),
    tx.staffAvailability.findMany({ where: { organizationId, staffId, kind: "UNAVAILABLE", startAt: { lt: end }, endAt: { gt: start } }, select: { startAt: true, endAt: true, reason: true } }),
  ]);
  for (const a of assignments) {
    conflicts.push({ kind: "STAFF_ASSIGNMENT", message: `Déjà affecté (${a.role}) sur ${a.event.reference} — ${a.event.name}`, start: a.startAt.toISOString(), end: a.endAt.toISOString(), reference: a.event.reference });
  }
  for (const d of driving) {
    conflicts.push({ kind: "STAFF_DRIVING", message: `Conduit ${d.vehicle.registration} pour ${d.event.reference}`, start: d.startAt.toISOString(), end: d.endAt.toISOString(), reference: d.event.reference });
  }
  for (const u of unavailable) {
    conflicts.push({ kind: "STAFF_UNAVAILABLE", message: `Indisponible${u.reason ? ` : ${u.reason}` : ""}`, start: u.startAt.toISOString(), end: u.endAt.toISOString() });
  }
  return { staff, conflicts };
}
