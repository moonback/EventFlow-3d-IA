import "server-only";
import type { Prisma, ReservationStatus } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import type {
  PrepareInput,
  ReservationCreateInput,
  ReservationUpdateInput,
  ReturnInput,
} from "@/features/reservations/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { computeAvailability } from "./availability-service";
import { getSystemLocation, LOGISTICS_ROLES, lockProducts, MANAGEMENT_ROLES, nextDocumentNumber, notifyRoles, withRetry } from "./common";
import { applyMovement } from "./stock-movement-service";

const EDITABLE: ReservationStatus[] = ["DRAFT", "PENDING", "CONFIRMED"];
const CANCELLABLE: ReservationStatus[] = ["DRAFT", "PENDING", "CONFIRMED", "IN_PREPARATION", "PREPARED"];

export interface Shortage {
  productId: string;
  sku: string;
  name: string;
  requested: number;
  available: number;
  capacity: number;
  conflicts: { reservationId: string; reference: string; eventName: string; start: string; end: string; quantity: number }[];
}

async function loadReservationForUpdate(tx: Tx, ctx: AuthContext, id: string) {
  // Verrou ligne de la réservation : sérialise les transitions d'état concurrentes
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Reservation" WHERE "id" = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  if (locked.length === 0) throw new NotFoundError("Réservation");
  return tx.reservation.findUniqueOrThrow({
    where: { id },
    include: {
      lines: { include: { product: { select: { id: true, sku: true, name: true, stockManaged: true, defaultLocationId: true } } }, orderBy: { productId: "asc" } },
      event: { select: { id: true, name: true, reference: true } },
    },
  });
}

async function addHistory(tx: Tx, reservationId: string, from: ReservationStatus | null, to: ReservationStatus, userId: string, comment?: string) {
  await tx.reservationHistory.create({ data: { reservationId, fromStatus: from, toStatus: to, userId, comment } });
}

function normalizeLines(lines: { productId: string; quantity: number; notes?: string }[]) {
  const merged = new Map<string, { productId: string; quantity: number; notes?: string }>();
  for (const l of lines) {
    const prev = merged.get(l.productId);
    merged.set(l.productId, { productId: l.productId, quantity: (prev?.quantity ?? 0) + l.quantity, notes: l.notes ?? prev?.notes });
  }
  return [...merged.values()];
}

async function assertProductsInOrg(tx: Tx, organizationId: string, productIds: string[]) {
  const count = await tx.equipmentProduct.count({ where: { organizationId, id: { in: productIds }, archivedAt: null } });
  if (count !== new Set(productIds).size) throw new NotFoundError("Produit");
}

/** Vérifie la disponibilité des lignes ; lève INSUFFICIENT_AVAILABILITY avec le détail des conflits. */
async function assertAvailable(
  tx: Tx,
  organizationId: string,
  reservation: { id?: string; startAt: Date; endAt: Date; prepBufferHours: number; returnBufferHours: number },
  lines: { productId: string; quantity: number }[],
) {
  const products = await tx.equipmentProduct.findMany({
    where: { organizationId, id: { in: lines.map((l) => l.productId) } },
    select: { id: true, sku: true, name: true, stockManaged: true },
  });
  const managed = products.filter((p) => p.stockManaged);
  const availability = await computeAvailability(tx, organizationId, managed.map((p) => p.id), reservation.startAt, reservation.endAt, {
    excludeReservationId: reservation.id,
    windowBufferHours: { prep: reservation.prepBufferHours, ret: reservation.returnBufferHours },
  });
  const shortages: Shortage[] = [];
  for (const line of lines) {
    const product = managed.find((p) => p.id === line.productId);
    if (!product) continue;
    const a = availability.get(product.id)!;
    if (a.available < line.quantity) {
      shortages.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        requested: line.quantity,
        available: Math.max(0, a.available),
        capacity: a.capacity,
        conflicts: a.conflicts.map((c) => ({ ...c, start: c.start.toISOString(), end: c.end.toISOString() })),
      });
    }
  }
  if (shortages.length > 0) {
    const detail = shortages.map((s) => `${s.name} (demandé ${s.requested}, disponible ${s.available})`).join(", ");
    throw new BusinessRuleError("INSUFFICIENT_AVAILABILITY", `Stock insuffisant sur la période : ${detail}`, { shortages });
  }
}

export async function createReservation(ctx: AuthContext, input: ReservationCreateInput) {
  assertCan(ctx, "reservations:write");
  const lines = normalizeLines(input.lines);
  return withRetry(async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: input.eventId, organizationId: ctx.organizationId },
      select: { id: true, startAt: true, endAt: true, setupStartAt: true, teardownEndAt: true, status: true },
    });
    if (!event) throw new NotFoundError("Événement");
    if (event.status === "CANCELLED") throw new BusinessRuleError("EVENT_CANCELLED", "L'événement est annulé");
    await assertProductsInOrg(tx, ctx.organizationId, lines.map((l) => l.productId));
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { prepBufferHours: true, returnBufferHours: true },
    });
    const startAt = input.startAt ?? event.setupStartAt ?? event.startAt;
    const endAt = input.endAt ?? event.teardownEndAt ?? event.endAt;
    if (endAt <= startAt) throw new ValidationError("La fin doit être postérieure au début", { endAt: ["Période invalide"] });
    const reference = await nextDocumentNumber(tx, ctx.organizationId, "reservation", "RES");
    const reservation = await tx.reservation.create({
      data: {
        organizationId: ctx.organizationId,
        reference,
        eventId: event.id,
        startAt,
        endAt,
        prepBufferHours: input.prepBufferHours ?? org.prepBufferHours,
        returnBufferHours: input.returnBufferHours ?? org.returnBufferHours,
        notes: input.notes,
        lines: { create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, notes: l.notes })) },
      },
      select: { id: true, reference: true, status: true },
    });
    await addHistory(tx, reservation.id, null, "DRAFT", ctx.userId, "Création");
    await audit(ctx, "reservation.created", "Reservation", reservation.id, { reference, eventId: event.id }, tx);
    return reservation;
  });
}

/**
 * Modification contrôlée : brouillon / en attente librement ; une réservation confirmée est
 * revérifiée sous verrou (hors elle-même) avant d'enregistrer les nouvelles quantités / dates.
 */
export async function updateReservation(ctx: AuthContext, id: string, input: ReservationUpdateInput) {
  assertCan(ctx, "reservations:write");
  return withRetry(async (tx) => {
    const current = await loadReservationForUpdate(tx, ctx, id);
    if (!EDITABLE.includes(current.status)) {
      throw new BusinessRuleError("NOT_EDITABLE", "Cette réservation ne peut plus être modifiée (préparation commencée)");
    }
    if (current.status === "CONFIRMED") assertCan(ctx, "reservations:confirm");
    const lines = input.lines ? normalizeLines(input.lines) : current.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, notes: l.notes ?? undefined }));
    if (input.lines) await assertProductsInOrg(tx, ctx.organizationId, lines.map((l) => l.productId));
    const next = {
      startAt: input.startAt ?? current.startAt,
      endAt: input.endAt ?? current.endAt,
      prepBufferHours: input.prepBufferHours ?? current.prepBufferHours,
      returnBufferHours: input.returnBufferHours ?? current.returnBufferHours,
    };
    if (next.endAt <= next.startAt) throw new ValidationError("La fin doit être postérieure au début", { endAt: ["Période invalide"] });

    if (current.status === "CONFIRMED") {
      await lockProducts(tx, ctx.organizationId, [...lines.map((l) => l.productId), ...current.lines.map((l) => l.productId)]);
      await assertAvailable(tx, ctx.organizationId, { id, ...next }, lines);
    }
    await tx.reservation.update({ where: { id }, data: { ...next, notes: input.notes ?? current.notes } });
    if (input.lines) {
      await tx.reservationLine.deleteMany({ where: { reservationId: id } });
      await tx.reservationLine.createMany({ data: lines.map((l) => ({ reservationId: id, productId: l.productId, quantity: l.quantity, notes: l.notes })) });
    }
    await addHistory(tx, id, current.status, current.status, ctx.userId, "Modification");
    await audit(ctx, "reservation.updated", "Reservation", id, {
      startAt: next.startAt.toISOString(),
      endAt: next.endAt.toISOString(),
      lines: lines.map((l) => `${l.productId}×${l.quantity}`),
    }, tx);
    return { id };
  });
}

/** Passe en « en attente » (option posée, non bloquante). */
export async function submitReservation(ctx: AuthContext, id: string) {
  assertCan(ctx, "reservations:write");
  return withRetry(async (tx) => {
    const r = await loadReservationForUpdate(tx, ctx, id);
    if (r.status !== "DRAFT") throw new BusinessRuleError("INVALID_TRANSITION", "Seul un brouillon peut être mis en attente");
    await tx.reservation.update({ where: { id }, data: { status: "PENDING" } });
    await addHistory(tx, id, r.status, "PENDING", ctx.userId);
    return { id, status: "PENDING" as const };
  });
}

/**
 * Confirmation sécurisée contre les accès concurrents :
 * 1. verrou de la réservation, 2. verrou des produits (ordre stable),
 * 3. recalcul de disponibilité avec les données validées, 4. passage en CONFIRMED.
 * Deux confirmations simultanées sur un même produit sont sérialisées par le verrou :
 * la seconde voit la première et échoue si le stock ne suffit plus.
 */
export async function confirmReservation(ctx: AuthContext, id: string) {
  assertCan(ctx, "reservations:confirm");
  return withRetry(async (tx) => {
    const r = await loadReservationForUpdate(tx, ctx, id);
    if (r.status !== "DRAFT" && r.status !== "PENDING") {
      throw new BusinessRuleError("INVALID_TRANSITION", `Impossible de confirmer une réservation au statut ${r.status}`);
    }
    if (r.lines.length === 0) throw new BusinessRuleError("EMPTY_RESERVATION", "La réservation ne contient aucune ligne");
    await lockProducts(tx, ctx.organizationId, r.lines.map((l) => l.productId));
    await assertAvailable(tx, ctx.organizationId, r, r.lines);
    await tx.reservation.update({ where: { id }, data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: ctx.userId } });
    await addHistory(tx, id, r.status, "CONFIRMED", ctx.userId);
    await audit(ctx, "reservation.confirmed", "Reservation", id, { reference: r.reference }, tx);
    await notifyRoles(tx, ctx.organizationId, LOGISTICS_ROLES, {
      type: "RESERVATION_CONFIRMED",
      title: `Réservation ${r.reference} confirmée`,
      body: `${r.event.name} — ${r.lines.length} référence(s) à préparer`,
      link: `/reservations/${id}`,
    });
    return { id, status: "CONFIRMED" as const };
  });
}

/** Annulation avec motif ; le matériel déjà préparé est remis en rayon automatiquement. */
export async function cancelReservation(ctx: AuthContext, id: string, reason: string) {
  assertCan(ctx, "reservations:confirm");
  return withRetry(async (tx) => {
    const r = await loadReservationForUpdate(tx, ctx, id);
    if (!CANCELLABLE.includes(r.status)) {
      throw new BusinessRuleError("INVALID_TRANSITION", "Une réservation expédiée ne peut pas être annulée : enregistrez le retour");
    }
    const prepared = r.lines.filter((l) => l.quantityPrepared > 0);
    if (prepared.length > 0) {
      await lockProducts(tx, ctx.organizationId, prepared.map((l) => l.productId));
      const prep = await getSystemLocation(tx, ctx.organizationId, "PREPARATION");
      for (const line of prepared) {
        const target = line.product.defaultLocationId ?? (await defaultStorageLocation(tx, ctx.organizationId));
        const fromLocationId = await findPreparationLocationHolding(tx, line.productId, line.quantityPrepared, prep.id);
        await applyMovement(tx, ctx, {
          type: "UNPREPARE",
          productId: line.productId,
          quantity: line.quantityPrepared,
          fromLocationId,
          toLocationId: target,
          reservationId: id,
          reason: `Annulation ${r.reference}`,
        });
        await tx.reservationLine.update({ where: { id: line.id }, data: { quantityPrepared: 0 } });
      }
    }
    await tx.reservation.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
    await addHistory(tx, id, r.status, "CANCELLED", ctx.userId, reason);
    await audit(ctx, "reservation.cancelled", "Reservation", id, { reason }, tx);
    return { id, status: "CANCELLED" as const };
  });
}

async function defaultStorageLocation(tx: Tx, organizationId: string) {
  const loc = await tx.stockLocation.findFirst({
    where: { organizationId, isActive: true, kind: { in: ["BIN", "RACK", "ZONE", "WAREHOUSE"] } },
    orderBy: [{ kind: "asc" }, { code: "asc" }],
    select: { id: true },
  });
  if (!loc) throw new BusinessRuleError("MISSING_STORAGE", "Aucun emplacement de stockage configuré");
  return loc.id;
}

async function findPreparationLocationHolding(tx: Tx, productId: string, quantity: number, fallback: string) {
  const balance = await tx.stockBalance.findFirst({
    where: { productId, quantity: { gte: quantity }, location: { kind: "PREPARATION" } },
    orderBy: { quantity: "desc" },
    select: { locationId: true },
  });
  return balance?.locationId ?? fallback;
}

/** Préparation : prélèvement depuis les emplacements de stockage vers la zone de préparation. */
export async function prepareReservation(ctx: AuthContext, id: string, input: PrepareInput) {
  assertCan(ctx, "logistics:operate");
  return withRetry(async (tx) => {
    const r = await loadReservationForUpdate(tx, ctx, id);
    if (r.status !== "CONFIRMED" && r.status !== "IN_PREPARATION" && r.status !== "PREPARED") {
      throw new BusinessRuleError("INVALID_TRANSITION", "La réservation doit être confirmée avant préparation");
    }
    const prepLocationId = input.preparationLocationId ?? (await getSystemLocation(tx, ctx.organizationId, "PREPARATION")).id;
    await lockProducts(tx, ctx.organizationId, input.lines.map((l) => l.productId));
    const pending = new Map(r.lines.map((l) => [l.productId, { line: l, remaining: l.quantity - l.quantityPrepared }]));
    for (const pick of [...input.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const entry = pending.get(pick.productId);
      if (!entry) throw new ValidationError("Produit absent de la réservation");
      if (!entry.line.product.stockManaged) throw new BusinessRuleError("NOT_STOCK_MANAGED", `${entry.line.product.name} n'est pas géré en stock`);
      if (pick.quantity > entry.remaining) {
        throw new BusinessRuleError("OVER_PREPARATION", `« ${entry.line.product.name} » : ${entry.remaining} restant(s) à préparer, ${pick.quantity} saisi(s)`);
      }
      await applyMovement(tx, ctx, {
        type: "PREPARATION",
        productId: pick.productId,
        quantity: pick.quantity,
        fromLocationId: pick.fromLocationId,
        toLocationId: prepLocationId,
        reservationId: id,
        reason: `Préparation ${r.reference}`,
      });
      entry.remaining -= pick.quantity;
      await tx.reservationLine.update({ where: { id: entry.line.id }, data: { quantityPrepared: { increment: pick.quantity } } });
    }
    const complete = [...pending.values()].every((e) => e.remaining === 0 || !e.line.product.stockManaged);
    const status: ReservationStatus = complete ? "PREPARED" : "IN_PREPARATION";
    if (status !== r.status) {
      await tx.reservation.update({ where: { id }, data: { status, preparedById: ctx.userId } });
      await addHistory(tx, id, r.status, status, ctx.userId);
    }
    await audit(ctx, "reservation.prepared", "Reservation", id, { lines: input.lines.map((l) => `${l.productId}×${l.quantity}`) }, tx);
    return { id, status };
  });
}

/** Remise en rayon de matériel préparé (erreur de préparation, réduction de besoin). */
export async function unprepareReservation(ctx: AuthContext, id: string, input: { lines: { productId: string; toLocationId: string; quantity: number }[] }) {
  assertCan(ctx, "logistics:operate");
  return withRetry(async (tx) => {
    const r = await loadReservationForUpdate(tx, ctx, id);
    if (r.status !== "IN_PREPARATION" && r.status !== "PREPARED") {
      throw new BusinessRuleError("INVALID_TRANSITION", "Aucune préparation en cours");
    }
    await lockProducts(tx, ctx.organizationId, input.lines.map((l) => l.productId));
    const prep = await getSystemLocation(tx, ctx.organizationId, "PREPARATION");
    for (const item of input.lines) {
      const line = r.lines.find((l) => l.productId === item.productId);
      if (!line || item.quantity > line.quantityPrepared) throw new BusinessRuleError("INVALID_QUANTITY", "Quantité supérieure à la quantité préparée");
      const fromLocationId = await findPreparationLocationHolding(tx, item.productId, item.quantity, prep.id);
      await applyMovement(tx, ctx, { type: "UNPREPARE", productId: item.productId, quantity: item.quantity, fromLocationId, toLocationId: item.toLocationId, reservationId: id, reason: `Remise en rayon ${r.reference}` });
      await tx.reservationLine.update({ where: { id: line.id }, data: { quantityPrepared: { decrement: item.quantity } } });
    }
    const after = await tx.reservationLine.findMany({ where: { reservationId: id }, select: { quantityPrepared: true } });
    const status: ReservationStatus = after.some((l) => l.quantityPrepared > 0) ? "IN_PREPARATION" : "CONFIRMED";
    await tx.reservation.update({ where: { id }, data: { status } });
    await addHistory(tx, id, r.status, status, ctx.userId, "Remise en rayon");
    return { id, status };
  });
}

/** Expédition : sortie du matériel préparé vers l'emplacement virtuel « sorti ». */
export async function shipReservation(ctx: AuthContext, id: string, input: { allowIncomplete: boolean; notes?: string }) {
  assertCan(ctx, "logistics:operate");
  return withRetry(async (tx) => {
    const r = await loadReservationForUpdate(tx, ctx, id);
    if (r.status !== "PREPARED" && r.status !== "IN_PREPARATION") {
      throw new BusinessRuleError("INVALID_TRANSITION", "La réservation doit être préparée avant expédition");
    }
    const missing = r.lines.filter((l) => l.product.stockManaged && l.quantityPrepared < l.quantity);
    if (missing.length > 0 && !input.allowIncomplete) {
      throw new BusinessRuleError("PREPARATION_INCOMPLETE", "La préparation est incomplète", {
        missing: missing.map((l) => ({ productId: l.productId, name: l.product.name, requested: l.quantity, prepared: l.quantityPrepared })),
      });
    }
    const toShip = r.lines.filter((l) => l.quantityPrepared - l.quantityShipped > 0);
    if (toShip.length === 0) throw new BusinessRuleError("NOTHING_TO_SHIP", "Aucun matériel préparé à expédier");
    await lockProducts(tx, ctx.organizationId, toShip.map((l) => l.productId));
    const prep = await getSystemLocation(tx, ctx.organizationId, "PREPARATION");
    const out = await getSystemLocation(tx, ctx.organizationId, "OUT");
    for (const line of toShip) {
      const quantity = line.quantityPrepared - line.quantityShipped;
      const fromLocationId = await findPreparationLocationHolding(tx, line.productId, quantity, prep.id);
      await applyMovement(tx, ctx, { type: "SHIPMENT", productId: line.productId, quantity, fromLocationId, toLocationId: out.id, reservationId: id, reason: `Expédition ${r.reference}` });
      await tx.reservationLine.update({ where: { id: line.id }, data: { quantityShipped: { increment: quantity } } });
    }
    await tx.reservation.update({ where: { id }, data: { status: "SHIPPED", shippedAt: new Date() } });
    await addHistory(tx, id, r.status, "SHIPPED", ctx.userId, input.notes);
    await audit(ctx, "reservation.shipped", "Reservation", id, { incomplete: missing.length > 0 }, tx);
    if (missing.length > 0) {
      await notifyRoles(tx, ctx.organizationId, [...LOGISTICS_ROLES, ...MANAGEMENT_ROLES], {
        type: "PREPARATION_INCOMPLETE",
        title: `Expédition incomplète : ${r.reference}`,
        body: missing.map((l) => `${l.product.name} : ${l.quantityPrepared}/${l.quantity}`).join(", "),
        link: `/reservations/${id}`,
      });
    }
    return { id, status: "SHIPPED" as const, incomplete: missing.length > 0 };
  });
}

/**
 * Retour (partiel ou total) avec contrôle : quantités bonnes → zone de retour,
 * quantités endommagées → quarantaine (indisponibles) + ticket de maintenance.
 * Les manquants restent « sortis » et continuent de bloquer jusqu'au retour ou déclaration de perte.
 */
export async function recordReturn(ctx: AuthContext, id: string, input: ReturnInput) {
  assertCan(ctx, "logistics:operate");
  return withRetry(async (tx) => {
    const r = await loadReservationForUpdate(tx, ctx, id);
    if (r.status !== "SHIPPED" && r.status !== "PARTIALLY_RETURNED") {
      throw new BusinessRuleError("INVALID_TRANSITION", "Aucun matériel sorti pour cette réservation");
    }
    const relevant = input.lines.filter((l) => l.quantityGood + l.quantityDamaged > 0);
    if (relevant.length === 0) throw new ValidationError("Saisissez au moins une quantité retournée");
    await lockProducts(tx, ctx.organizationId, relevant.map((l) => l.productId));
    const out = await getSystemLocation(tx, ctx.organizationId, "OUT");
    const returnLocationId = input.returnLocationId ?? (await getSystemLocation(tx, ctx.organizationId, "RETURN")).id;
    const quarantine = relevant.some((l) => l.quantityDamaged > 0) ? await getSystemLocation(tx, ctx.organizationId, "QUARANTINE") : null;

    const inspection = await tx.returnInspection.create({
      data: { organizationId: ctx.organizationId, reservationId: id, inspectedById: ctx.userId, notes: input.notes },
      select: { id: true },
    });
    const damagedLines: { productId: string; name: string; quantity: number }[] = [];
    for (const item of [...relevant].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const line = r.lines.find((l) => l.productId === item.productId);
      if (!line) throw new ValidationError("Produit absent de la réservation");
      const outstanding = line.quantityShipped - line.quantityReturned - line.quantityDamaged - line.quantityLost;
      const total = item.quantityGood + item.quantityDamaged;
      if (total > outstanding) {
        throw new BusinessRuleError("OVER_RETURN", `« ${line.product.name} » : ${outstanding} attendu(s), ${total} saisi(s)`);
      }
      if (item.quantityGood > 0) {
        await applyMovement(tx, ctx, { type: "RETURN", productId: item.productId, quantity: item.quantityGood, fromLocationId: out.id, toLocationId: returnLocationId, reservationId: id, reason: `Retour ${r.reference}` });
      }
      if (item.quantityDamaged > 0) {
        await applyMovement(tx, ctx, { type: "RETURN_DAMAGED", productId: item.productId, quantity: item.quantityDamaged, fromLocationId: out.id, toLocationId: quarantine!.id, reservationId: id, reason: item.anomaly ?? `Retour endommagé ${r.reference}` });
        damagedLines.push({ productId: item.productId, name: line.product.name, quantity: item.quantityDamaged });
      }
      await tx.reservationLine.update({
        where: { id: line.id },
        data: { quantityReturned: { increment: item.quantityGood }, quantityDamaged: { increment: item.quantityDamaged } },
      });
      await tx.returnInspectionLine.create({
        data: {
          inspectionId: inspection.id,
          productId: item.productId,
          quantityExpected: outstanding,
          quantityGood: item.quantityGood,
          quantityDamaged: item.quantityDamaged,
          quantityMissing: outstanding - total,
          anomaly: item.anomaly,
        },
      });
    }
    for (const d of damagedLines) {
      const reference = await nextDocumentNumber(tx, ctx.organizationId, "maintenance", "MNT");
      await tx.maintenanceTicket.create({
        data: {
          organizationId: ctx.organizationId,
          reference,
          productId: d.productId,
          quantity: d.quantity,
          title: `Contrôle après retour ${r.reference}`,
          description: relevant.find((l) => l.productId === d.productId)?.anomaly ?? "Matériel signalé endommagé au retour",
          sourceReservationId: id,
          openedById: ctx.userId,
        },
      });
    }
    const status = await refreshReturnStatus(tx, id, r.status, ctx.userId);
    await audit(ctx, "reservation.returned", "Reservation", id, {
      inspectionId: inspection.id,
      lines: relevant.map((l) => `${l.productId}: bon ${l.quantityGood}, endommagé ${l.quantityDamaged}`),
    }, tx);
    if (damagedLines.length > 0) {
      await notifyRoles(tx, ctx.organizationId, LOGISTICS_ROLES, {
        type: "EQUIPMENT_DAMAGED",
        title: `Matériel endommagé au retour de ${r.reference}`,
        body: damagedLines.map((d) => `${d.name} × ${d.quantity}`).join(", "),
        link: `/maintenance`,
      });
    }
    return { id, status, inspectionId: inspection.id };
  });
}

async function refreshReturnStatus(tx: Tx, id: string, from: ReservationStatus, userId: string): Promise<ReservationStatus> {
  const lines = await tx.reservationLine.findMany({
    where: { reservationId: id },
    select: { quantityShipped: true, quantityReturned: true, quantityDamaged: true, quantityLost: true },
  });
  const outstanding = lines.reduce((acc, l) => acc + (l.quantityShipped - l.quantityReturned - l.quantityDamaged - l.quantityLost), 0);
  const status: ReservationStatus = outstanding === 0 ? "RETURNED" : "PARTIALLY_RETURNED";
  await tx.reservation.update({ where: { id }, data: { status, returnedAt: outstanding === 0 ? new Date() : null } });
  if (status !== from) await addHistory(tx, id, from, status, userId);
  return status;
}

/** Déclaration de perte d'un matériel resté sur site (sortie définitive du stock). */
export async function declareLoss(ctx: AuthContext, id: string, input: { productId: string; quantity: number; reason: string }) {
  assertCan(ctx, "logistics:operate", "stock:write");
  return withRetry(async (tx) => {
    const r = await loadReservationForUpdate(tx, ctx, id);
    if (r.status !== "SHIPPED" && r.status !== "PARTIALLY_RETURNED") throw new BusinessRuleError("INVALID_TRANSITION", "Aucun matériel sorti");
    const line = r.lines.find((l) => l.productId === input.productId);
    if (!line) throw new ValidationError("Produit absent de la réservation");
    const outstanding = line.quantityShipped - line.quantityReturned - line.quantityDamaged - line.quantityLost;
    if (input.quantity > outstanding) throw new BusinessRuleError("OVER_LOSS", `Seulement ${outstanding} unité(s) encore sortie(s)`);
    await lockProducts(tx, ctx.organizationId, [input.productId]);
    const out = await getSystemLocation(tx, ctx.organizationId, "OUT");
    await applyMovement(tx, ctx, { type: "LOSS", productId: input.productId, quantity: input.quantity, fromLocationId: out.id, reservationId: id, reason: input.reason });
    await tx.reservationLine.update({ where: { id: line.id }, data: { quantityLost: { increment: input.quantity } } });
    const status = await refreshReturnStatus(tx, id, r.status, ctx.userId);
    await audit(ctx, "reservation.loss_declared", "Reservation", id, { productId: input.productId, quantity: input.quantity, reason: input.reason }, tx);
    return { id, status };
  });
}

// ─── Lecture ─────────────────────────────────────────────────────────────

export async function listReservations(ctx: AuthContext, query: ListQuery & { status?: ReservationStatus; eventId?: string }) {
  assertCan(ctx, "reservations:read");
  const where: Prisma.ReservationWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.eventId ? { eventId: query.eventId } : {}),
    ...(query.q
      ? { OR: [{ reference: { contains: query.q, mode: "insensitive" } }, { event: { name: { contains: query.q, mode: "insensitive" } } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.reservation.findMany({
      where,
      orderBy: { startAt: query.dir === "desc" ? "desc" : "asc" },
      ...paginationArgs(query),
      select: {
        id: true,
        reference: true,
        status: true,
        startAt: true,
        endAt: true,
        event: { select: { id: true, name: true, reference: true, timezone: true } },
        _count: { select: { lines: true } },
        lines: { select: { quantity: true, quantityPrepared: true } },
      },
    }),
    db.reservation.count({ where }),
  ]);
  return paginated(
    rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      status: r.status,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      event: r.event,
      lineCount: r._count.lines,
      totalQuantity: r.lines.reduce((a, l) => a + l.quantity, 0),
      preparedQuantity: r.lines.reduce((a, l) => a + l.quantityPrepared, 0),
    })),
    total,
    query,
  );
}

export async function getReservation(ctx: AuthContext, id: string) {
  assertCan(ctx, "reservations:read");
  const r = await db.reservation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true,
      reference: true,
      status: true,
      startAt: true,
      endAt: true,
      prepBufferHours: true,
      returnBufferHours: true,
      notes: true,
      cancelReason: true,
      confirmedAt: true,
      shippedAt: true,
      returnedAt: true,
      createdAt: true,
      event: { select: { id: true, name: true, reference: true, timezone: true, venueName: true, city: true, customer: { select: { id: true, name: true } } } },
      lines: {
        orderBy: { product: { name: "asc" } },
        select: {
          id: true,
          quantity: true,
          quantityPrepared: true,
          quantityShipped: true,
          quantityReturned: true,
          quantityDamaged: true,
          quantityLost: true,
          notes: true,
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              unit: true,
              stockManaged: true,
              weightKg: true,
              volumeM3: true,
              lengthCm: true,
              widthCm: true,
              heightCm: true,
              category: { select: { name: true } },
              defaultLocation: { select: { id: true, code: true } },
              balances: {
                where: { quantity: { gt: 0 }, location: { kind: { in: ["WAREHOUSE", "ZONE", "RACK", "BIN", "RETURN"] } } },
                select: { quantity: true, location: { select: { id: true, code: true, name: true } } },
                orderBy: { quantity: "desc" },
              },
            },
          },
        },
      },
      history: {
        orderBy: { createdAt: "desc" },
        select: { id: true, fromStatus: true, toStatus: true, comment: true, createdAt: true, userId: true },
      },
      inspections: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          notes: true,
          lines: { select: { productId: true, quantityExpected: true, quantityGood: true, quantityDamaged: true, quantityMissing: true, anomaly: true, product: { select: { name: true } } } },
        },
      },
    },
  });
  if (!r) throw new NotFoundError("Réservation");
  const users = await db.user.findMany({
    where: { id: { in: r.history.map((h) => h.userId).filter((v): v is string => Boolean(v)) }, memberships: { some: { organizationId: ctx.organizationId } } },
    select: { id: true, name: true },
  });
  return {
    ...r,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    shippedAt: r.shippedAt?.toISOString() ?? null,
    returnedAt: r.returnedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    lines: r.lines.map((l) => ({
      ...l,
      outstanding: l.quantityShipped - l.quantityReturned - l.quantityDamaged - l.quantityLost,
      product: { ...l.product, weightKg: l.product.weightKg?.toString() ?? null },
    })),
    history: r.history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString(), userName: users.find((u) => u.id === h.userId)?.name ?? null })),
    inspections: r.inspections.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
  };
}
