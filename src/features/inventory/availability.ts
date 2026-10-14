/**
 * Calcul pur de disponibilité sur une période (sans accès base, testable unitairement).
 * Voir docs/BUSINESS_RULES.md §Disponibilité.
 */
import type { ReservationStatus } from "@prisma/client";

/** Statuts qui immobilisent du stock. Brouillon, en attente, retournée et annulée ne bloquent pas. */
export const BLOCKING_STATUSES: ReservationStatus[] = ["CONFIRMED", "IN_PREPARATION", "PREPARED", "SHIPPED", "PARTIALLY_RETURNED"];
export const SHIPPED_STATUSES: ReservationStatus[] = ["SHIPPED", "PARTIALLY_RETURNED"];

export interface ReservationLineForAvailability {
  reservationId: string;
  reference: string;
  eventName: string;
  status: ReservationStatus;
  startAt: Date;
  endAt: Date;
  prepBufferHours: number;
  returnBufferHours: number;
  quantity: number;
  quantityShipped: number;
  quantityReturned: number;
  quantityDamaged: number;
  quantityLost: number;
}

export interface BlockingInterval {
  reservationId: string;
  reference: string;
  eventName: string;
  start: Date;
  end: Date;
  quantity: number;
}

const HOUR = 3_600_000;

/**
 * Quantité et fenêtre bloquées par une ligne :
 * - avant expédition : la quantité réservée, sur [début − tampon prépa, fin + tampon retour) ;
 * - après expédition : la quantité encore dehors (expédiée − retournée − endommagée − perdue) ;
 *   si le retour est en retard, la fenêtre s'étend jusqu'à maintenant + tampon retour.
 */
export function blockingInterval(line: ReservationLineForAvailability, now: Date): BlockingInterval | null {
  if (!BLOCKING_STATUSES.includes(line.status)) return null;
  const start = new Date(line.startAt.getTime() - line.prepBufferHours * HOUR);
  let end = new Date(line.endAt.getTime() + line.returnBufferHours * HOUR);
  let quantity = line.quantity;
  if (SHIPPED_STATUSES.includes(line.status)) {
    quantity = Math.max(0, line.quantityShipped - line.quantityReturned - line.quantityDamaged - line.quantityLost);
    const lateEnd = new Date(now.getTime() + line.returnBufferHours * HOUR);
    if (quantity > 0 && lateEnd > end) end = lateEnd;
  }
  if (quantity <= 0) return null;
  return { reservationId: line.reservationId, reference: line.reference, eventName: line.eventName, start, end, quantity };
}

/** Pic de quantité simultanément bloquée sur [windowStart, windowEnd) (balayage d'intervalles). */
export function peakUsage(intervals: BlockingInterval[], windowStart: Date, windowEnd: Date): number {
  const points: { t: number; delta: number }[] = [];
  for (const iv of intervals) {
    const s = Math.max(iv.start.getTime(), windowStart.getTime());
    const e = Math.min(iv.end.getTime(), windowEnd.getTime());
    if (s >= e) continue;
    points.push({ t: s, delta: iv.quantity }, { t: e, delta: -iv.quantity });
  }
  // Les fins sont traitées avant les débuts au même instant (intervalles semi-ouverts)
  points.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const p of points) {
    current += p.delta;
    if (current > peak) peak = current;
  }
  return peak;
}

export interface ProductAvailability {
  productId: string;
  /** Stock mobilisable : tout le stock possédé hors quarantaine et maintenance */
  capacity: number;
  /** Pic d'utilisation par les réservations actives sur la période */
  peakReserved: number;
  available: number;
  conflicts: BlockingInterval[];
}

export function computeProductAvailability(
  productId: string,
  capacity: number,
  lines: ReservationLineForAvailability[],
  windowStart: Date,
  windowEnd: Date,
  now: Date,
): ProductAvailability {
  const intervals = lines
    .map((l) => blockingInterval(l, now))
    .filter((iv): iv is BlockingInterval => iv !== null && iv.start < windowEnd && windowStart < iv.end);
  const peak = peakUsage(intervals, windowStart, windowEnd);
  return { productId, capacity, peakReserved: peak, available: capacity - peak, conflicts: intervals };
}
