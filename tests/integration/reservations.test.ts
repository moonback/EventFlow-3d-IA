import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { BusinessRuleError } from "@/lib/errors";
import type { AuthContext } from "@/server/auth/context";
import { checkAvailability } from "@/server/services/availability-service";
import {
  cancelReservation,
  confirmReservation,
  createReservation,
  declareLoss,
  prepareReservation,
  recordReturn,
  shipReservation,
} from "@/server/services/reservation-service";
import { reconcileBalances, recordManualMovement } from "@/server/services/stock-movement-service";
import { createEvent, createLocations, createOrg, createProduct, createUserInOrg, day } from "../helpers/factories";

let ctx: AuthContext;
let orgId: string;
let locs: Awaited<ReturnType<typeof createLocations>>;

async function stockProduct(quantity: number) {
  const product = await createProduct(orgId);
  await recordManualMovement(ctx, { type: "RECEIPT", productId: product.id, quantity, toLocationId: locs.rackA.id, reason: "Stock initial" });
  return product;
}

async function confirmedReservation(productId: string, quantity: number, start: Date, end: Date) {
  const event = await createEvent(orgId, start, end);
  const r = await createReservation(ctx, { eventId: event.id, lines: [{ productId, quantity }] });
  await confirmReservation(ctx, r.id);
  return r;
}

beforeAll(async () => {
  const org = await createOrg("Réservations");
  orgId = org.id;
  ctx = await createUserInOrg(orgId, "LOGISTICS_MANAGER");
  locs = await createLocations(orgId);
});

describe("réservations et disponibilité", () => {
  it("crée et confirme une réservation valide", async () => {
    const p = await stockProduct(20);
    const r = await confirmedReservation(p.id, 12, day(1), day(3));
    const saved = await db.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(saved.status).toBe("CONFIRMED");
  });

  it("refuse une réservation en conflit sur une période qui se chevauche (20 projecteurs, 12 + 10)", async () => {
    const p = await stockProduct(20);
    await confirmedReservation(p.id, 12, day(1), day(3));
    const event = await createEvent(orgId, day(2), day(4));
    const r2 = await createReservation(ctx, { eventId: event.id, lines: [{ productId: p.id, quantity: 10 }] });
    await expect(confirmReservation(ctx, r2.id)).rejects.toMatchObject({ code: "INSUFFICIENT_AVAILABILITY" });
    // Sur une période disjointe, la même demande passe
    const event3 = await createEvent(orgId, day(10), day(12));
    const r3 = await createReservation(ctx, { eventId: event3.id, lines: [{ productId: p.id, quantity: 10 }] });
    await expect(confirmReservation(ctx, r3.id)).resolves.toMatchObject({ status: "CONFIRMED" });
  });

  it("empêche la sur-réservation lors de confirmations concurrentes", async () => {
    const p = await stockProduct(10);
    const events = await Promise.all([1, 2, 3, 4, 5].map(() => createEvent(orgId, day(5), day(6))));
    const reservations = await Promise.all(events.map((e) => createReservation(ctx, { eventId: e.id, lines: [{ productId: p.id, quantity: 4 }] })));
    const results = await Promise.allSettled(reservations.map((r) => confirmReservation(ctx, r.id)));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(2); // 2 × 4 = 8 ≤ 10 ; une 3e demande dépasserait
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    for (const r of rejected) expect(r.reason).toBeInstanceOf(BusinessRuleError);
    const [avail] = await checkAvailability(ctx, { productIds: [p.id], startAt: day(5), endAt: day(6), applyDefaultBuffers: false });
    expect(avail!.available).toBe(2);
  });

  it("ne bloque pas le stock avec des réservations brouillon, en attente ou annulées", async () => {
    const p = await stockProduct(5);
    const r = await confirmedReservation(p.id, 5, day(7), day(8));
    const [before] = await checkAvailability(ctx, { productIds: [p.id], startAt: day(7), endAt: day(8), applyDefaultBuffers: false });
    expect(before!.available).toBe(0);
    await cancelReservation(ctx, r.id, "Client a annulé");
    const event = await createEvent(orgId, day(7), day(8));
    await createReservation(ctx, { eventId: event.id, lines: [{ productId: p.id, quantity: 5 }] }); // brouillon
    const [after] = await checkAvailability(ctx, { productIds: [p.id], startAt: day(7), endAt: day(8), applyDefaultBuffers: false });
    expect(after!.available).toBe(5);
  });

  it("applique les tampons de préparation et de retour", async () => {
    const p = await stockProduct(4);
    const event = await createEvent(orgId, day(15, 9), day(15, 18));
    const r = await createReservation(ctx, { eventId: event.id, prepBufferHours: 24, returnBufferHours: 24, lines: [{ productId: p.id, quantity: 4 }] });
    await confirmReservation(ctx, r.id);
    // Le lendemain matin, le matériel est encore en retour / contrôle
    const [next] = await checkAvailability(ctx, { productIds: [p.id], startAt: day(16, 8), endAt: day(16, 12), applyDefaultBuffers: false });
    expect(next!.available).toBe(0);
  });

  it("enregistre la préparation, l'expédition et un retour partiel avec matériel endommagé", async () => {
    const p = await stockProduct(10);
    const r = await confirmedReservation(p.id, 6, day(20), day(21));
    await prepareReservation(ctx, r.id, { lines: [{ productId: p.id, fromLocationId: locs.rackA.id, quantity: 6 }] });
    expect((await db.reservation.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("PREPARED");
    // La préparation ne crée pas de stock : total inchangé
    const total = await db.stockBalance.aggregate({ where: { productId: p.id }, _sum: { quantity: true } });
    expect(total._sum.quantity).toBe(10);

    await shipReservation(ctx, r.id, { allowIncomplete: false });
    const res1 = await recordReturn(ctx, r.id, { lines: [{ productId: p.id, quantityGood: 3, quantityDamaged: 1, anomaly: "Lentille fissurée" }] });
    expect(res1.status).toBe("PARTIALLY_RETURNED");
    const line = await db.reservationLine.findFirstOrThrow({ where: { reservationId: r.id } });
    expect(line).toMatchObject({ quantityShipped: 6, quantityReturned: 3, quantityDamaged: 1 });
    const inspection = await db.returnInspectionLine.findFirstOrThrow({ where: { inspection: { reservationId: r.id } } });
    expect(inspection).toMatchObject({ quantityExpected: 6, quantityGood: 3, quantityDamaged: 1, quantityMissing: 2 });

    // Le matériel endommagé n'est pas disponible ; les 2 manquants restent bloqués (retour en retard)
    const [avail] = await checkAvailability(ctx, { productIds: [p.id], startAt: day(40), endAt: day(41), applyDefaultBuffers: false });
    expect(avail!.capacity).toBe(9); // 10 − 1 en quarantaine
    const ticket = await db.maintenanceTicket.findFirstOrThrow({ where: { sourceReservationId: r.id } });
    expect(ticket.quantity).toBe(1);

    const res2 = await recordReturn(ctx, r.id, { lines: [{ productId: p.id, quantityGood: 1, quantityDamaged: 0 }] });
    expect(res2.status).toBe("PARTIALLY_RETURNED");
    const res3 = await declareLoss(ctx, r.id, { productId: p.id, quantity: 1, reason: "Non retrouvé sur site" });
    expect(res3.status).toBe("RETURNED");
    await expect(reconcileBalances(orgId)).resolves.toEqual([]);
  });

  it("refuse de retourner plus que la quantité sortie", async () => {
    const p = await stockProduct(3);
    const r = await confirmedReservation(p.id, 2, day(25), day(26));
    await prepareReservation(ctx, r.id, { lines: [{ productId: p.id, fromLocationId: locs.rackA.id, quantity: 2 }] });
    await shipReservation(ctx, r.id, { allowIncomplete: false });
    await expect(recordReturn(ctx, r.id, { lines: [{ productId: p.id, quantityGood: 3, quantityDamaged: 0 }] })).rejects.toMatchObject({ code: "OVER_RETURN" });
  });
});
