import "server-only";
import type { MaintenanceStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { money } from "@/lib/serialize";
import type { maintenanceCreateSchema, maintenanceResolveSchema } from "@/features/maintenance/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { getSystemLocation, lockProducts, nextDocumentNumber, withRetry } from "./common";
import { applyMovement } from "./stock-movement-service";

/**
 * Cycle du matériel endommagé :
 *   quarantaine (indisponible) → atelier MAINTENANCE (indisponible) → réparé (retour en stock) ou rebut (perte).
 * Quantités du ticket : en quarantaine = quantité − en atelier − réparé − rebut.
 */
export async function listMaintenance(ctx: AuthContext, query: ListQuery & { status?: MaintenanceStatus; open?: boolean }) {
  assertCan(ctx, "stock:read");
  const where: Prisma.MaintenanceTicketWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.open ? { status: { in: ["OPEN", "IN_PROGRESS"] } } : {}),
    ...(query.q ? { OR: [{ reference: { contains: query.q, mode: "insensitive" } }, { title: { contains: query.q, mode: "insensitive" } }, { product: { name: { contains: query.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.maintenanceTicket.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      ...paginationArgs(query),
      select: {
        id: true, reference: true, title: true, description: true, status: true, quantity: true, quantityInRepair: true, quantityRepaired: true, quantityScrapped: true, cost: true, createdAt: true, resolvedAt: true, sourceReservationId: true,
        product: { select: { id: true, sku: true, name: true } },
      },
    }),
    db.maintenanceTicket.count({ where }),
  ]);
  return paginated(
    rows.map((t) => ({
      ...t,
      cost: money(t.cost),
      createdAt: t.createdAt.toISOString(),
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      inQuarantine: t.quantity - t.quantityInRepair - t.quantityRepaired - t.quantityScrapped,
    })),
    total,
    query,
  );
}

export async function createMaintenanceTicket(ctx: AuthContext, data: z.output<typeof maintenanceCreateSchema>) {
  assertCan(ctx, "maintenance:write");
  return withRetry(async (tx) => {
    await lockProducts(tx, ctx.organizationId, [data.productId]);
    const workshop = await getSystemLocation(tx, ctx.organizationId, "MAINTENANCE");
    const reference = await nextDocumentNumber(tx, ctx.organizationId, "maintenance", "MNT");
    const ticket = await tx.maintenanceTicket.create({
      data: { organizationId: ctx.organizationId, reference, productId: data.productId, quantity: data.quantity, quantityInRepair: data.quantity, status: "IN_PROGRESS", title: data.title, description: data.description, openedById: ctx.userId },
      select: { id: true, reference: true },
    });
    await applyMovement(tx, ctx, { type: "MAINTENANCE_IN", productId: data.productId, quantity: data.quantity, fromLocationId: data.fromLocationId, toLocationId: workshop.id, maintenanceTicketId: ticket.id, reason: `${reference} — ${data.title}` });
    await audit(ctx, "maintenance.created", "MaintenanceTicket", ticket.id, { reference, productId: data.productId, quantity: data.quantity }, tx);
    return ticket;
  });
}

async function lockTicket(tx: Prisma.TransactionClient, ctx: AuthContext, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "MaintenanceTicket" WHERE "id" = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("Ticket de maintenance");
  return tx.maintenanceTicket.findUniqueOrThrow({ where: { id } });
}

/** Passage en atelier du matériel en quarantaine. */
export async function startRepair(ctx: AuthContext, id: string) {
  assertCan(ctx, "maintenance:write");
  return withRetry(async (tx) => {
    const t = await lockTicket(tx, ctx, id);
    if (t.status !== "OPEN" && t.status !== "IN_PROGRESS") throw new BusinessRuleError("TICKET_CLOSED", "Ticket clôturé");
    const inQuarantine = t.quantity - t.quantityInRepair - t.quantityRepaired - t.quantityScrapped;
    if (inQuarantine <= 0) throw new BusinessRuleError("NOTHING_IN_QUARANTINE", "Aucune unité en quarantaine pour ce ticket");
    await lockProducts(tx, ctx.organizationId, [t.productId]);
    const quarantine = await getSystemLocation(tx, ctx.organizationId, "QUARANTINE");
    const workshop = await getSystemLocation(tx, ctx.organizationId, "MAINTENANCE");
    await applyMovement(tx, ctx, { type: "MAINTENANCE_IN", productId: t.productId, quantity: inQuarantine, fromLocationId: quarantine.id, toLocationId: workshop.id, maintenanceTicketId: id, reason: `${t.reference} — passage en atelier` });
    await tx.maintenanceTicket.update({ where: { id }, data: { status: "IN_PROGRESS", quantityInRepair: { increment: inQuarantine } } });
    await audit(ctx, "maintenance.started", "MaintenanceTicket", id, { quantity: inQuarantine }, tx);
    return { id };
  });
}

/** Clôture (partielle ou totale) : unités réparées remises en stock, unités irréparables sorties du stock. */
export async function resolveMaintenance(ctx: AuthContext, id: string, data: z.output<typeof maintenanceResolveSchema>) {
  assertCan(ctx, "maintenance:write");
  return withRetry(async (tx) => {
    const t = await lockTicket(tx, ctx, id);
    if (t.status !== "OPEN" && t.status !== "IN_PROGRESS") throw new BusinessRuleError("TICKET_CLOSED", "Ticket clôturé");
    const remaining = t.quantity - t.quantityRepaired - t.quantityScrapped;
    const requested = data.quantityRepaired + data.quantityScrapped;
    if (requested > remaining) throw new BusinessRuleError("OVER_RESOLUTION", `${remaining} unité(s) restante(s) sur ce ticket`);
    await lockProducts(tx, ctx.organizationId, [t.productId]);
    const workshop = await getSystemLocation(tx, ctx.organizationId, "MAINTENANCE");
    const quarantine = await getSystemLocation(tx, ctx.organizationId, "QUARANTINE");
    // Les unités sont prélevées d'abord en atelier, puis en quarantaine
    let fromWorkshop = Math.min(requested, t.quantityInRepair);
    const consume = (n: number) => {
      const w = Math.min(n, fromWorkshop);
      fromWorkshop -= w;
      const q = n - w;
      return { w, q };
    };
    const repaired = consume(data.quantityRepaired);
    const scrapped = consume(data.quantityScrapped);
    const moves: { qty: number; from: string; type: "MAINTENANCE_OUT" | "LOSS" }[] = [
      { qty: repaired.w, from: workshop.id, type: "MAINTENANCE_OUT" },
      { qty: repaired.q, from: quarantine.id, type: "MAINTENANCE_OUT" },
      { qty: scrapped.w, from: workshop.id, type: "LOSS" },
      { qty: scrapped.q, from: quarantine.id, type: "LOSS" },
    ];
    for (const m of moves) {
      if (m.qty <= 0) continue;
      await applyMovement(tx, ctx, {
        type: m.type,
        productId: t.productId,
        quantity: m.qty,
        fromLocationId: m.from,
        toLocationId: m.type === "MAINTENANCE_OUT" ? data.toLocationId : null,
        maintenanceTicketId: id,
        reason: m.type === "LOSS" ? `${t.reference} — mise au rebut` : `${t.reference} — réparé`,
      });
    }
    const repairedTotal = t.quantityRepaired + data.quantityRepaired;
    const scrappedTotal = t.quantityScrapped + data.quantityScrapped;
    const done = repairedTotal + scrappedTotal === t.quantity;
    const status: MaintenanceStatus = done ? (repairedTotal === 0 ? "SCRAPPED" : "RESOLVED") : "IN_PROGRESS";
    const cost = data.cost ? (t.cost ? t.cost.plus(data.cost) : data.cost) : t.cost;
    await tx.maintenanceTicket.update({
      where: { id },
      data: {
        quantityRepaired: repairedTotal,
        quantityScrapped: scrappedTotal,
        quantityInRepair: t.quantityInRepair - repaired.w - scrapped.w,
        status,
        cost,
        resolvedAt: done ? new Date() : null,
        description: data.notes ? [t.description, data.notes].filter(Boolean).join("\n") : t.description,
      },
    });
    if (data.cost) {
      await tx.expense.create({
        data: { organizationId: ctx.organizationId, category: "MAINTENANCE", description: `Réparation ${t.reference}`, amountExclTax: data.cost, incurredAt: new Date(), createdById: ctx.userId },
      });
    }
    await audit(ctx, "maintenance.resolved", "MaintenanceTicket", id, { repaired: data.quantityRepaired, scrapped: data.quantityScrapped, status }, tx);
    return { id, status };
  });
}
