import "server-only";
import type { ReservationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, type AuthContext } from "../auth/context";

const DAY = 86_400_000;

/** Tableau logistique : préparations, départs, matériel sur site et retours (avec véhicules affectés). */
export async function logisticsBoard(ctx: AuthContext, horizonDays = 14) {
  assertCan(ctx, "reservations:read");
  const now = new Date();
  const statuses: ReservationStatus[] = ["CONFIRMED", "IN_PREPARATION", "PREPARED", "SHIPPED", "PARTIALLY_RETURNED"];
  const rows = await db.reservation.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: { in: statuses },
      OR: [{ startAt: { lt: new Date(now.getTime() + horizonDays * DAY) } }, { status: { in: ["SHIPPED", "PARTIALLY_RETURNED"] } }],
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      reference: true,
      status: true,
      startAt: true,
      endAt: true,
      prepBufferHours: true,
      event: {
        select: {
          id: true,
          reference: true,
          name: true,
          timezone: true,
          city: true,
          vehicleAssignments: { where: { status: { not: "CANCELLED" } }, select: { id: true, startAt: true, vehicle: { select: { registration: true } }, driver: { select: { firstName: true, lastName: true } } } },
        },
      },
      lines: { select: { quantity: true, quantityPrepared: true, quantityShipped: true, quantityReturned: true, quantityDamaged: true, quantityLost: true } },
    },
  });
  const items = rows.map((r) => {
    const requested = r.lines.reduce((a, l) => a + l.quantity, 0);
    const prepared = r.lines.reduce((a, l) => a + l.quantityPrepared, 0);
    const outstanding = r.lines.reduce((a, l) => a + (l.quantityShipped - l.quantityReturned - l.quantityDamaged - l.quantityLost), 0);
    const departure = new Date(r.startAt.getTime());
    return {
      id: r.id,
      reference: r.reference,
      status: r.status,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      prepDeadline: new Date(r.startAt.getTime() - r.prepBufferHours * 3_600_000).toISOString(),
      event: { id: r.event.id, reference: r.event.reference, name: r.event.name, timezone: r.event.timezone, city: r.event.city },
      vehicles: r.event.vehicleAssignments.map((v) => ({ id: v.id, registration: v.vehicle.registration, driver: v.driver ? `${v.driver.firstName} ${v.driver.lastName}` : null, startAt: v.startAt.toISOString() })),
      requested,
      prepared,
      outstanding,
      progress: requested ? Math.round((prepared / requested) * 100) : 0,
      lateDeparture: departure < now && ["CONFIRMED", "IN_PREPARATION", "PREPARED"].includes(r.status),
      lateReturn: r.endAt < now && outstanding > 0,
    };
  });
  return {
    toPrepare: items.filter((i) => i.status === "CONFIRMED" || i.status === "IN_PREPARATION"),
    ready: items.filter((i) => i.status === "PREPARED"),
    onSite: items.filter((i) => (i.status === "SHIPPED" || i.status === "PARTIALLY_RETURNED") && !i.lateReturn && new Date(i.endAt) > now),
    returns: items.filter((i) => (i.status === "SHIPPED" || i.status === "PARTIALLY_RETURNED") && (i.lateReturn || new Date(i.endAt) <= now)),
  };
}
