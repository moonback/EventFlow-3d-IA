import "server-only";
import { db, type Tx } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import {
  BLOCKING_STATUSES,
  computeProductAvailability,
  SHIPPED_STATUSES,
  type ProductAvailability,
  type ReservationLineForAvailability,
} from "@/features/inventory/availability";
import { assertCan, type AuthContext } from "../auth/context";
import { UNSERVICEABLE_KINDS } from "./common";

const HOUR = 3_600_000;

/**
 * Disponibilité réelle de produits sur une période, à partir des soldes et des réservations
 * actives qui chevauchent la période (tampons inclus). À appeler dans la transaction qui a
 * verrouillé les produits lorsqu'il s'agit de confirmer une réservation.
 */
export async function computeAvailability(
  tx: Tx,
  organizationId: string,
  productIds: string[],
  windowStart: Date,
  windowEnd: Date,
  options: { excludeReservationId?: string; now?: Date; windowBufferHours?: { prep: number; ret: number } } = {},
): Promise<Map<string, ProductAvailability>> {
  const ids = [...new Set(productIds)];
  const now = options.now ?? new Date();
  const result = new Map<string, ProductAvailability>();
  if (ids.length === 0) return result;
  if (windowEnd <= windowStart) throw new ValidationError("La fin de période doit être postérieure au début");

  const balances = await tx.stockBalance.groupBy({
    by: ["productId"],
    where: { organizationId, productId: { in: ids }, location: { kind: { notIn: UNSERVICEABLE_KINDS } } },
    _sum: { quantity: true },
  });
  const capacity = new Map(balances.map((b) => [b.productId, b._sum.quantity ?? 0]));

  // Fenêtre élargie : on charge toutes les réservations susceptibles de chevaucher (tampons max 30 j)
  const margin = 30 * 24 * HOUR;
  const lines = await tx.reservationLine.findMany({
    where: {
      productId: { in: ids },
      reservation: {
        organizationId,
        status: { in: BLOCKING_STATUSES },
        ...(options.excludeReservationId ? { id: { not: options.excludeReservationId } } : {}),
        startAt: { lt: new Date(windowEnd.getTime() + margin) },
        OR: [{ endAt: { gt: new Date(windowStart.getTime() - margin) } }, { status: { in: SHIPPED_STATUSES } }],
      },
    },
    select: {
      productId: true,
      quantity: true,
      quantityShipped: true,
      quantityReturned: true,
      quantityDamaged: true,
      quantityLost: true,
      reservation: {
        select: {
          id: true,
          reference: true,
          status: true,
          startAt: true,
          endAt: true,
          prepBufferHours: true,
          returnBufferHours: true,
          event: { select: { name: true } },
        },
      },
    },
  });

  const byProduct = new Map<string, ReservationLineForAvailability[]>();
  for (const l of lines) {
    const arr = byProduct.get(l.productId) ?? [];
    arr.push({
      reservationId: l.reservation.id,
      reference: l.reservation.reference,
      eventName: l.reservation.event.name,
      status: l.reservation.status,
      startAt: l.reservation.startAt,
      endAt: l.reservation.endAt,
      prepBufferHours: l.reservation.prepBufferHours,
      returnBufferHours: l.reservation.returnBufferHours,
      quantity: l.quantity,
      quantityShipped: l.quantityShipped,
      quantityReturned: l.quantityReturned,
      quantityDamaged: l.quantityDamaged,
      quantityLost: l.quantityLost,
    });
    byProduct.set(l.productId, arr);
  }

  const bufferedStart = options.windowBufferHours ? new Date(windowStart.getTime() - options.windowBufferHours.prep * HOUR) : windowStart;
  const bufferedEnd = options.windowBufferHours ? new Date(windowEnd.getTime() + options.windowBufferHours.ret * HOUR) : windowEnd;
  for (const id of ids) {
    result.set(id, computeProductAvailability(id, capacity.get(id) ?? 0, byProduct.get(id) ?? [], bufferedStart, bufferedEnd, now));
  }
  return result;
}

/** Endpoint de consultation : disponibilité d'une liste de produits sur une période. */
export async function checkAvailability(
  ctx: AuthContext,
  input: { productIds: string[]; startAt: Date; endAt: Date; excludeReservationId?: string; applyDefaultBuffers?: boolean },
) {
  assertCan(ctx, "inventory:read");
  const org = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { prepBufferHours: true, returnBufferHours: true },
  });
  const products = await db.equipmentProduct.findMany({
    where: { organizationId: ctx.organizationId, id: { in: input.productIds } },
    select: { id: true, name: true, sku: true, stockManaged: true },
  });
  const map = await computeAvailability(
    db,
    ctx.organizationId,
    products.filter((p) => p.stockManaged).map((p) => p.id),
    input.startAt,
    input.endAt,
    {
      excludeReservationId: input.excludeReservationId,
      windowBufferHours: input.applyDefaultBuffers === false ? undefined : { prep: org.prepBufferHours, ret: org.returnBufferHours },
    },
  );
  return products.map((p) => {
    const a = map.get(p.id);
    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      stockManaged: p.stockManaged,
      capacity: a?.capacity ?? null,
      reserved: a?.peakReserved ?? 0,
      available: a ? a.available : null,
      conflicts: (a?.conflicts ?? []).map((c) => ({ ...c, start: c.start.toISOString(), end: c.end.toISOString() })),
    };
  });
}
