import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as portalRespond } from "@/app/api/portal/assignments/[id]/response/route";
import { GET as portalGet } from "@/app/api/portal/route";
import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";
import { computeEventFinancials } from "@/server/services/finance-service";
import { addTimesheet, createStaffAssignment, setStaffAssignmentStatus } from "@/server/services/staff-service";
import { declareAvailability, deletePortalAvailability, getPortalOverview, respondToProposal } from "@/server/services/staff-portal-service";
import { issuePortalToken, type PortalContext, resolvePortalToken, revokePortalTokens } from "@/server/services/staff-portal-token-service";
import { createEvent, createOrg, createUserInOrg, day } from "../helpers/factories";

let ctx: AuthContext;
let staffId: string;
let eventId: string;

beforeAll(async () => {
  const org = await createOrg("Portail");
  ctx = await createUserInOrg(org.id, "LOGISTICS_MANAGER");
  staffId = (await db.staffMember.create({ data: { organizationId: org.id, firstName: "Inès", lastName: "Roux", email: "ines@test.local", employmentType: "INTERMITTENT", hourlyCost: "30.00" } })).id;
  eventId = (await createEvent(org.id, day(3, 8), day(3, 23))).id;
});

const mission = (n: number, propose = true) => ({ eventId, staffId, role: "Régie son", requiredSkillId: null, startAt: day(n, 8), endAt: day(n, 18), propose });

describe("proposition de mission (gestionnaire)", () => {
  it("crée l'affectation en statut PROPOSED", async () => {
    const a = await createStaffAssignment(ctx, mission(3));
    const row = await db.eventStaffAssignment.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("PROPOSED");
  });

  it("sans propose, l'affectation reste PLANNED (comportement historique)", async () => {
    const a = await createStaffAssignment(ctx, mission(4, false));
    expect((await db.eventStaffAssignment.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PLANNED");
  });

  it("le gestionnaire ne peut pas confirmer une proposition, seulement l'annuler", async () => {
    const a = await createStaffAssignment(ctx, mission(5));
    await expect(setStaffAssignmentStatus(ctx, a.id, "CONFIRMED")).rejects.toMatchObject({ code: "AWAITING_RESPONSE" });
    await expect(setStaffAssignmentStatus(ctx, a.id, "IN_PROGRESS")).rejects.toMatchObject({ code: "AWAITING_RESPONSE" });
    await expect(setStaffAssignmentStatus(ctx, a.id, "CANCELLED")).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("une affectation refusée ne peut pas être réactivée", async () => {
    const a = await createStaffAssignment(ctx, mission(6));
    await db.eventStaffAssignment.update({ where: { id: a.id }, data: { status: "DECLINED" } });
    await expect(setStaffAssignmentStatus(ctx, a.id, "PLANNED")).rejects.toMatchObject({ code: "ASSIGNMENT_DECLINED" });
  });

  it("une mission refusée n'entre pas dans le coût prévisionnel de l'événement", async () => {
    const ev = await createEvent(ctx.organizationId, day(23, 8), day(23, 20));
    const a = await createStaffAssignment(ctx, { ...mission(23), eventId: ev.id });
    await db.eventStaffAssignment.update({ where: { id: a.id }, data: { status: "DECLINED" } });
    const f = (await computeEventFinancials(ctx.organizationId, [ev.id])).get(ev.id)!;
    expect(f.laborPlanned).toBe("0.00");
  });

  it("aucun relevé d'heures sur une mission non acceptée", async () => {
    const a = await createStaffAssignment(ctx, mission(7));
    await expect(addTimesheet(ctx, a.id, { workDate: day(7), hours: "4.00", notes: null })).rejects.toMatchObject({ code: "ASSIGNMENT_NOT_CONFIRMED" });
  });
});

const tokenOf = (link: string) => new URL(link).searchParams.get("token")!;

describe("jetons du portail", () => {
  it("émet un lien dont seul le hash est stocké, et le résout vers le bon collaborateur", async () => {
    const { link } = await issuePortalToken(ctx, staffId, { sendEmail: false });
    const token = tokenOf(link);
    expect(await db.staffPortalToken.count({ where: { tokenHash: token } })).toBe(0);
    const p = await resolvePortalToken(token);
    expect(p).toMatchObject({ staffId, organizationId: ctx.organizationId });
  });

  it("refuse un jeton inconnu, expiré ou révoqué", async () => {
    await expect(resolvePortalToken("inconnu")).rejects.toMatchObject({ status: 401 });
    const { link } = await issuePortalToken(ctx, staffId, { sendEmail: false });
    await expect(resolvePortalToken(tokenOf(link), new Date(Date.now() + 31 * 86_400_000))).rejects.toMatchObject({ status: 401 });
    expect((await revokePortalTokens(ctx, staffId)).revoked).toBeGreaterThan(0);
    await expect(resolvePortalToken(tokenOf(link))).rejects.toMatchObject({ status: 401 });
  });

  it("refuse le jeton d'un collaborateur désactivé", async () => {
    const other = await db.staffMember.create({ data: { organizationId: ctx.organizationId, firstName: "Old", lastName: "Timer", employmentType: "FREELANCE" } });
    const { link } = await issuePortalToken(ctx, other.id, { sendEmail: false });
    await db.staffMember.update({ where: { id: other.id }, data: { isActive: false } });
    await expect(resolvePortalToken(tokenOf(link))).rejects.toMatchObject({ status: 401 });
  });

  it("n'émet pas de lien pour un collaborateur d'une autre organisation", async () => {
    const org2 = await createOrg("Autre");
    const foreign = await db.staffMember.create({ data: { organizationId: org2.id, firstName: "X", lastName: "Y" } });
    await expect(issuePortalToken(ctx, foreign.id, { sendEmail: false })).rejects.toMatchObject({ status: 404 });
  });

  it("un rôle sans staff:assign ne peut pas émettre de lien", async () => {
    const crew = await createUserInOrg(ctx.organizationId, "CREW");
    await expect(issuePortalToken(crew, staffId, { sendEmail: false })).rejects.toMatchObject({ status: 403 });
  });
});

async function portal(): Promise<PortalContext> {
  const { link } = await issuePortalToken(ctx, staffId, { sendEmail: false });
  return resolvePortalToken(tokenOf(link));
}

describe("portail prestataire", () => {
  it("affiche les propositions sans exposer les coûts", async () => {
    const a = await createStaffAssignment(ctx, mission(8));
    const view = await getPortalOverview(await portal());
    expect(view.proposals.find((x) => x.id === a.id)).toBeDefined();
    expect(JSON.stringify(view)).not.toContain("hourlyCost");
    expect(JSON.stringify(view)).not.toContain("30.00");
  });

  it("accepter confirme l'affectation, notifie et audite", async () => {
    const a = await createStaffAssignment(ctx, mission(9));
    const res = await respondToProposal(await portal(), a.id, { decision: "ACCEPT", reason: null });
    expect(res.status).toBe("CONFIRMED");
    const row = await db.eventStaffAssignment.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.respondedAt).not.toBeNull();
    expect(await db.notification.count({ where: { organizationId: ctx.organizationId, type: "STAFF_MISSION_RESPONSE" } })).toBeGreaterThan(0);
    expect(await db.auditLog.count({ where: { entityId: a.id, action: "staff.mission_accepted", actorId: null } })).toBe(1);
  });

  it("refuser libère le créneau et conserve le motif", async () => {
    const a = await createStaffAssignment(ctx, mission(10));
    await respondToProposal(await portal(), a.id, { decision: "DECLINE", reason: "Déjà engagé ailleurs" });
    const row = await db.eventStaffAssignment.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ status: "DECLINED", declineReason: "Déjà engagé ailleurs" });
    await expect(createStaffAssignment(ctx, mission(10))).resolves.toBeDefined();
  });

  it("double réponse simultanée : une seule transition", async () => {
    const a = await createStaffAssignment(ctx, mission(11));
    const p = await portal();
    const results = await Promise.allSettled([respondToProposal(p, a.id, { decision: "ACCEPT", reason: null }), respondToProposal(p, a.id, { decision: "ACCEPT", reason: null })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "ASSIGNMENT_ALREADY_ANSWERED" } });
  });

  it("refuse l'acceptation si le créneau est désormais pris", async () => {
    const a = await createStaffAssignment(ctx, mission(12));
    await db.staffAvailability.create({ data: { organizationId: ctx.organizationId, staffId, startAt: day(12, 0), endAt: day(13, 0), reason: "Congés" } });
    await expect(respondToProposal(await portal(), a.id, { decision: "ACCEPT", reason: null })).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" });
    expect((await db.eventStaffAssignment.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PROPOSED");
  });

  it("refuse l'acceptation si l'événement a été annulé", async () => {
    const ev = await createEvent(ctx.organizationId, day(14, 8), day(14, 20));
    const a = await createStaffAssignment(ctx, { ...mission(14), eventId: ev.id });
    await db.event.update({ where: { id: ev.id }, data: { status: "CANCELLED" } });
    await expect(respondToProposal(await portal(), a.id, { decision: "ACCEPT", reason: null })).rejects.toMatchObject({ code: "EVENT_CANCELLED" });
  });

  it("ne permet pas de répondre pour un autre collaborateur", async () => {
    const other = await db.staffMember.create({ data: { organizationId: ctx.organizationId, firstName: "Paul", lastName: "Morel", employmentType: "FREELANCE" } });
    const a = await createStaffAssignment(ctx, { ...mission(15), staffId: other.id });
    await expect(respondToProposal(await portal(), a.id, { decision: "ACCEPT", reason: null })).rejects.toMatchObject({ status: 404 });
  });

  it("déclare et supprime ses disponibilités, sans toucher à celles du régisseur", async () => {
    const p = await portal();
    const mine = await declareAvailability(p, { kind: "AVAILABLE", startAt: day(16, 0), endAt: day(18, 0), reason: null });
    const managerEntry = await db.staffAvailability.create({ data: { organizationId: ctx.organizationId, staffId, startAt: day(19, 0), endAt: day(20, 0), reason: "Formation" } });
    const view = await getPortalOverview(p);
    expect(view.availabilities.find((x) => x.id === mine.id)?.editable).toBe(true);
    expect(view.availabilities.find((x) => x.id === managerEntry.id)?.editable).toBe(false);
    await expect(deletePortalAvailability(p, managerEntry.id)).rejects.toMatchObject({ status: 404 });
    await expect(deletePortalAvailability(p, mine.id)).resolves.toBeUndefined();
  });
});

describe("API du portail", () => {
  it("401 sans jeton, 200 avec jeton valide, réponse via en-tête", async () => {
    const noToken = await portalGet(new NextRequest("http://localhost/api/portal"), { params: Promise.resolve({}) });
    expect(noToken.status).toBe(401);
    const { link } = await issuePortalToken(ctx, staffId, { sendEmail: false });
    const headers = { "x-portal-token": tokenOf(link), "content-type": "application/json" };
    const ok = await portalGet(new NextRequest("http://localhost/api/portal", { headers }), { params: Promise.resolve({}) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const a = await createStaffAssignment(ctx, mission(21));
    const res = await portalRespond(new NextRequest(`http://localhost/api/portal/assignments/${a.id}/response`, { method: "POST", headers, body: JSON.stringify({ decision: "DECLINE", reason: "" }) }), { params: Promise.resolve({ id: a.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("DECLINED");
  });

  it("refuse une requête d'une origine étrangère", async () => {
    const { link } = await issuePortalToken(ctx, staffId, { sendEmail: false });
    const a = await createStaffAssignment(ctx, mission(22));
    const res = await portalRespond(new NextRequest(`http://localhost/api/portal/assignments/${a.id}/response`, { method: "POST", headers: { "x-portal-token": tokenOf(link), "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ decision: "ACCEPT" }) }), { params: Promise.resolve({ id: a.id }) });
    expect(res.status).toBe(403);
  });
});
