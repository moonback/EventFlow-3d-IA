import { describe, expect, it } from "vitest";
import { blockingInterval, computeProductAvailability, peakUsage, type ReservationLineForAvailability } from "@/features/inventory/availability";

const d = (day: number, hour = 0) => new Date(Date.UTC(2031, 0, day, hour));
const line = (over: Partial<ReservationLineForAvailability>): ReservationLineForAvailability => ({
  reservationId: "r",
  reference: "RES",
  eventName: "E",
  status: "CONFIRMED",
  startAt: d(10),
  endAt: d(12),
  prepBufferHours: 0,
  returnBufferHours: 0,
  quantity: 5,
  quantityShipped: 0,
  quantityReturned: 0,
  quantityDamaged: 0,
  quantityLost: 0,
  ...over,
});

describe("disponibilité sur une période", () => {
  it("calcule le pic d'utilisation et non la somme", () => {
    const ivs = [
      { reservationId: "a", reference: "a", eventName: "", start: d(1), end: d(3), quantity: 5 },
      { reservationId: "b", reference: "b", eventName: "", start: d(3), end: d(5), quantity: 7 },
      { reservationId: "c", reference: "c", eventName: "", start: d(2), end: d(4), quantity: 2 },
    ];
    expect(peakUsage(ivs, d(1), d(5))).toBe(9);
    expect(peakUsage(ivs, d(4), d(5))).toBe(7);
  });

  it("exemple métier : 20 projecteurs, 12 réservés → seulement 8 disponibles sur la période", () => {
    const a = computeProductAvailability("p", 20, [line({ quantity: 12 })], d(11), d(13), d(1));
    expect(a.available).toBe(8);
  });

  it("ignore brouillons, attentes, annulations et retours terminés", () => {
    const lines = (["DRAFT", "PENDING", "CANCELLED", "RETURNED"] as const).map((status) => line({ status }));
    expect(computeProductAvailability("p", 5, lines, d(10), d(12), d(1)).available).toBe(5);
  });

  it("après expédition, ne bloque que la quantité encore dehors et prolonge un retour en retard", () => {
    const shipped = line({ status: "PARTIALLY_RETURNED", quantity: 10, quantityShipped: 10, quantityReturned: 6, quantityDamaged: 1, returnBufferHours: 24 });
    const now = d(20);
    const iv = blockingInterval(shipped, now)!;
    expect(iv.quantity).toBe(3);
    expect(iv.end.getTime()).toBe(d(21).getTime());
    expect(computeProductAvailability("p", 10, [shipped], d(20, 12), d(20, 13), now).available).toBe(7);
  });

  it("applique les tampons de préparation et de retour", () => {
    const l = line({ prepBufferHours: 48, returnBufferHours: 24 });
    const iv = blockingInterval(l, d(1))!;
    expect(iv.start.getTime()).toBe(d(8).getTime());
    expect(iv.end.getTime()).toBe(d(13).getTime());
  });
});
