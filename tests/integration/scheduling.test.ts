import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";
import { createStaffAssignment, previewStaffAssignment } from "@/server/services/staff-service";
import { createVehicleAssignment } from "@/server/services/vehicle-service";
import { createEvent, createOrg, createUserInOrg, day } from "../helpers/factories";

let ctx: AuthContext;
let vehicleId: string;
let staffId: string;
let event1: { id: string };
let event2: { id: string };

beforeAll(async () => {
  const org = await createOrg("Planif");
  ctx = await createUserInOrg(org.id, "LOGISTICS_MANAGER");
  vehicleId = (await db.vehicle.create({ data: { organizationId: org.id, registration: "AB-123-CD", brand: "Renault", model: "Master", type: "VAN", payloadKg: 1200, requiredLicense: "B" } })).id;
  staffId = (await db.staffMember.create({ data: { organizationId: org.id, firstName: "Léa", lastName: "Martin", drivingLicenses: "B", hourlyCost: "25.00" } })).id;
  event1 = await createEvent(org.id, day(10, 8), day(10, 20));
  event2 = await createEvent(org.id, day(10, 12), day(10, 22));
});

describe("véhicules", () => {
  it("détecte les doubles affectations incompatibles", async () => {
    await createVehicleAssignment(ctx, { vehicleId, eventId: event1.id, driverId: null, startAt: day(10, 6), endAt: day(10, 12), purpose: null, loadWeightKg: "500", loadVolumeM3: null, distanceKm: null });
    await expect(createVehicleAssignment(ctx, { vehicleId, eventId: event2.id, driverId: null, startAt: day(10, 10), endAt: day(10, 14), purpose: null, loadWeightKg: null, loadVolumeM3: null, distanceKm: null })).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" });
    // Créneau contigu (fin = début) : pas de conflit
    await expect(createVehicleAssignment(ctx, { vehicleId, eventId: event2.id, driverId: null, startAt: day(10, 12), endAt: day(10, 16), purpose: null, loadWeightKg: null, loadVolumeM3: null, distanceKm: null })).resolves.toBeDefined();
  });

  it("refuse un dépassement de charge utile", async () => {
    await expect(createVehicleAssignment(ctx, { vehicleId, eventId: event1.id, driverId: null, startAt: day(12, 6), endAt: day(12, 12), purpose: null, loadWeightKg: "1500", loadVolumeM3: null, distanceKm: null })).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT", details: { conflicts: [{ kind: "CAPACITY_WEIGHT" }] } });
  });

  it("refuse un véhicule en entretien sur la période", async () => {
    await db.vehicleMaintenance.create({ data: { organizationId: ctx.organizationId, vehicleId, title: "Vidange", scheduledAt: day(14, 8), blocksVehicle: true } });
    await expect(createVehicleAssignment(ctx, { vehicleId, eventId: event1.id, driverId: null, startAt: day(14, 10), endAt: day(14, 18), purpose: null, loadWeightKg: null, loadVolumeM3: null, distanceKm: null })).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" });
  });

  it("concurrence : deux affectations simultanées du même véhicule → une seule réussit", async () => {
    const results = await Promise.allSettled([1, 2, 3].map(() => createVehicleAssignment(ctx, { vehicleId, eventId: event1.id, driverId: null, startAt: day(20, 8), endAt: day(20, 18), purpose: null, loadWeightKg: null, loadVolumeM3: null, distanceKm: null })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("personnel", () => {
  it("détecte les conflits d'affectation et les indisponibilités", async () => {
    await createStaffAssignment(ctx, { eventId: event1.id, staffId, role: "Technicien son", requiredSkillId: null, startAt: day(10, 8), endAt: day(10, 20), propose: false });
    await expect(createStaffAssignment(ctx, { eventId: event2.id, staffId, role: "Régisseur", requiredSkillId: null, startAt: day(10, 18), endAt: day(10, 22), propose: false })).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" });
    await db.staffAvailability.create({ data: { organizationId: ctx.organizationId, staffId, startAt: day(15, 0), endAt: day(16, 0), reason: "Congés" } });
    const preview = await previewStaffAssignment(ctx, { eventId: event2.id, staffId, role: "Régisseur", requiredSkillId: null, startAt: day(15, 9), endAt: day(15, 17), propose: false });
    expect(preview.conflicts.map((c) => c.kind)).toContain("STAFF_UNAVAILABLE");
  });

  it("vérifie les compétences exigées", async () => {
    const skill = await db.skill.create({ data: { organizationId: ctx.organizationId, name: "Habilitation électrique" } });
    await expect(createStaffAssignment(ctx, { eventId: event2.id, staffId, role: "Électricien", requiredSkillId: skill.id, startAt: day(22, 9), endAt: day(22, 17), propose: false })).rejects.toMatchObject({ details: { conflicts: [{ kind: "SKILL_MISSING" }] } });
    await db.staffSkill.create({ data: { staffId, skillId: skill.id } });
    await expect(createStaffAssignment(ctx, { eventId: event2.id, staffId, role: "Électricien", requiredSkillId: skill.id, startAt: day(22, 9), endAt: day(22, 17), propose: false })).resolves.toBeDefined();
  });

  it("une proposition en attente bloque le créneau, une proposition refusée non", async () => {
    const proposed = await db.eventStaffAssignment.create({ data: { organizationId: ctx.organizationId, eventId: event1.id, staffId, role: "Son", status: "PROPOSED", startAt: day(27, 8), endAt: day(27, 18) } });
    const preview = await previewStaffAssignment(ctx, { eventId: event2.id, staffId, role: "Son", requiredSkillId: null, startAt: day(27, 10), endAt: day(27, 12), propose: false });
    expect(preview.conflicts.map((c) => c.kind)).toContain("STAFF_ASSIGNMENT");
    await db.eventStaffAssignment.update({ where: { id: proposed.id }, data: { status: "DECLINED" } });
    const after = await previewStaffAssignment(ctx, { eventId: event2.id, staffId, role: "Son", requiredSkillId: null, startAt: day(27, 10), endAt: day(27, 12), propose: false });
    expect(after.conflicts).toHaveLength(0);
  });

  it("une disponibilité déclarée (AVAILABLE) ne crée pas de conflit", async () => {
    await db.staffAvailability.create({ data: { organizationId: ctx.organizationId, staffId, kind: "AVAILABLE", startAt: day(28, 0), endAt: day(29, 0) } });
    const preview = await previewStaffAssignment(ctx, { eventId: event2.id, staffId, role: "Son", requiredSkillId: null, startAt: day(28, 9), endAt: day(28, 17), propose: false });
    expect(preview.conflicts).toHaveLength(0);
  });

  it("un chauffeur affecté à un véhicule n'est pas disponible pour une autre mission", async () => {
    const v2 = await db.vehicle.create({ data: { organizationId: ctx.organizationId, registration: "ZZ-999-ZZ", brand: "Iveco", model: "Daily", type: "TRUCK_LIGHT", requiredLicense: "C" } });
    await expect(createVehicleAssignment(ctx, { vehicleId: v2.id, eventId: event1.id, driverId: staffId, startAt: day(25, 8), endAt: day(25, 12), purpose: null, loadWeightKg: null, loadVolumeM3: null, distanceKm: null })).rejects.toMatchObject({ details: { conflicts: [{ kind: "LICENSE_MISSING" }] } });
  });
});
