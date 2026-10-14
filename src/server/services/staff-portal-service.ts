import "server-only";
import type { z } from "zod";
import type { portalAvailabilitySchema, proposalResponseSchema } from "@/features/staff-portal/schemas";
import { db } from "@/lib/db";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { audit } from "../audit";
import { LOGISTICS_ROLES, MANAGEMENT_ROLES, notifyRoles, withRetry } from "./common";
import { staffConflicts } from "./scheduling";
import type { PortalContext } from "./staff-portal-token-service";

const actor = (p: PortalContext) => ({ organizationId: p.organizationId, userId: null });
const NOTIFIED_ROLES = [...new Set([...LOGISTICS_ROLES, ...MANAGEMENT_ROLES])];
const missionSelect = {
  id: true, role: true, status: true, startAt: true, endAt: true,
  event: { select: { reference: true, name: true, venueName: true, startAt: true, endAt: true } },
} as const;

interface MissionRow {
  id: string;
  role: string;
  status: string;
  startAt: Date;
  endAt: Date;
  event: { reference: string; name: string; venueName: string | null; startAt: Date; endAt: Date };
}

const serializeMission = (m: MissionRow) => ({
  ...m,
  startAt: m.startAt.toISOString(),
  endAt: m.endAt.toISOString(),
  event: { ...m.event, startAt: m.event.startAt.toISOString(), endAt: m.event.endAt.toISOString() },
});

/** Vue du portail : uniquement les données du collaborateur du jeton, sans aucun coût. */
export async function getPortalOverview(p: PortalContext) {
  const now = new Date();
  const scope = { organizationId: p.organizationId, staffId: p.staffId };
  const [proposals, upcoming, availabilities] = await Promise.all([
    db.eventStaffAssignment.findMany({ where: { ...scope, status: "PROPOSED", endAt: { gt: now } }, orderBy: { startAt: "asc" }, select: missionSelect }),
    db.eventStaffAssignment.findMany({ where: { ...scope, status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] }, endAt: { gt: now } }, orderBy: { startAt: "asc" }, take: 50, select: missionSelect }),
    db.staffAvailability.findMany({ where: { ...scope, endAt: { gt: now } }, orderBy: { startAt: "asc" }, take: 100, select: { id: true, kind: true, startAt: true, endAt: true, reason: true, declaredViaPortal: true } }),
  ]);
  return {
    staffName: p.staffName,
    organization: p.organization,
    proposals: proposals.map(serializeMission),
    upcoming: upcoming.map(serializeMission),
    availabilities: availabilities.map((a) => ({
      id: a.id,
      kind: a.kind,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      // Le motif d'une indisponibilité saisie par la régie peut être interne : il n'est pas exposé
      reason: a.declaredViaPortal ? a.reason : null,
      editable: a.declaredViaPortal,
    })),
  };
}

/** Réponse à une proposition. Seule l'acceptation du prestataire confirme l'affectation. */
export async function respondToProposal(p: PortalContext, assignmentId: string, input: z.output<typeof proposalResponseSchema>) {
  return withRetry(async (tx) => {
    // Verrou sur le collaborateur : sérialise les réponses et les affectations concurrentes
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "StaffMember" WHERE "id" = ${p.staffId} AND "organizationId" = ${p.organizationId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Mission");
    const a = await tx.eventStaffAssignment.findFirst({
      where: { id: assignmentId, organizationId: p.organizationId, staffId: p.staffId },
      select: { id: true, status: true, role: true, startAt: true, endAt: true, event: { select: { id: true, reference: true, status: true } } },
    });
    if (!a) throw new NotFoundError("Mission");
    if (a.status !== "PROPOSED") throw new BusinessRuleError("ASSIGNMENT_ALREADY_ANSWERED", "Vous avez déjà répondu à cette proposition (ou elle a été retirée)");
    if (input.decision === "ACCEPT") {
      if (a.event.status === "CANCELLED") throw new BusinessRuleError("EVENT_CANCELLED", "L'événement a été annulé");
      const { conflicts } = await staffConflicts(tx, p.organizationId, p.staffId, a.startAt, a.endAt, { staffAssignmentId: a.id });
      if (conflicts.length > 0) {
        throw new BusinessRuleError("SCHEDULE_CONFLICT", "Ce créneau n'est plus libre dans votre planning : contactez la régie", { conflicts: conflicts.map((c) => ({ kind: c.kind })) });
      }
    }
    const status = input.decision === "ACCEPT" ? ("CONFIRMED" as const) : ("DECLINED" as const);
    const updated = await tx.eventStaffAssignment.updateMany({
      where: { id: a.id, status: "PROPOSED" },
      data: { status, respondedAt: new Date(), declineReason: status === "DECLINED" ? input.reason : null },
    });
    if (updated.count === 0) throw new BusinessRuleError("ASSIGNMENT_ALREADY_ANSWERED", "Vous avez déjà répondu à cette proposition");
    await audit(actor(p), status === "CONFIRMED" ? "staff.mission_accepted" : "staff.mission_declined", "EventStaffAssignment", a.id, { staffId: p.staffId, via: "portal" }, tx);
    await notifyRoles(tx, p.organizationId, NOTIFIED_ROLES, {
      type: "STAFF_MISSION_RESPONSE",
      title: `${p.staffName} a ${status === "CONFIRMED" ? "accepté" : "refusé"} la mission ${a.event.reference} (${a.role})`,
      body: status === "DECLINED" && input.reason ? `Motif : ${input.reason}` : undefined,
      link: `/events/${a.event.id}`,
      dedupeKey: `mission-response:${a.id}`,
    });
    return { id: a.id, status };
  });
}

export async function declareAvailability(p: PortalContext, input: z.output<typeof portalAvailabilitySchema>) {
  const row = await db.staffAvailability.create({
    data: { organizationId: p.organizationId, staffId: p.staffId, kind: input.kind, startAt: input.startAt, endAt: input.endAt, reason: input.reason, declaredViaPortal: true },
    select: { id: true },
  });
  await audit(actor(p), "staff.availability_declared", "StaffAvailability", row.id, { staffId: p.staffId, kind: input.kind });
  return row;
}

export async function deletePortalAvailability(p: PortalContext, id: string) {
  const r = await db.staffAvailability.deleteMany({ where: { id, organizationId: p.organizationId, staffId: p.staffId, declaredViaPortal: true } });
  if (r.count === 0) throw new NotFoundError("Disponibilité");
  await audit(actor(p), "staff.availability_deleted", "StaffAvailability", id, { staffId: p.staffId });
}
