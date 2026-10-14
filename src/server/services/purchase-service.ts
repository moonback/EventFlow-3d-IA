import "server-only";
import type { Prisma, PurchaseOrderStatus } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { computeLineTotal, sumMoney } from "@/lib/money";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { money, moneyOrZero } from "@/lib/serialize";
import type { purchaseOrderSchema, receiveSchema } from "@/features/purchases/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { lockProducts, nextDocumentNumber, withRetry } from "./common";
import { applyMovement } from "./stock-movement-service";

type POData = z.output<typeof purchaseOrderSchema>;

function totalOf(lines: POData["lines"]) {
  return sumMoney(lines.map((l) => computeLineTotal({ quantity: l.quantityOrdered, unitPrice: l.unitCost, vatRate: 0 }))).toFixed(2);
}

async function assertRefs(ctx: AuthContext, data: POData) {
  const sup = await db.supplier.findFirst({ where: { id: data.supplierId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!sup) throw new ValidationError("Fournisseur inconnu", { supplierId: ["Introuvable"] });
  const ids = [...new Set(data.lines.map((l) => l.productId))];
  if (ids.length !== data.lines.length) throw new ValidationError("Un produit apparaît plusieurs fois");
  const count = await db.equipmentProduct.count({ where: { organizationId: ctx.organizationId, id: { in: ids }, stockManaged: true } });
  if (count !== ids.length) throw new ValidationError("Produit inconnu ou non géré en stock");
}

export async function createPurchaseOrder(ctx: AuthContext, data: POData) {
  assertCan(ctx, "purchases:write");
  await assertRefs(ctx, data);
  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, ctx.organizationId, "purchase_order", "CF");
    const po = await tx.purchaseOrder.create({
      data: {
        organizationId: ctx.organizationId,
        number,
        supplierId: data.supplierId,
        expectedAt: data.expectedAt,
        supplierInvoiceRef: data.supplierInvoiceRef,
        notes: data.notes,
        totalExclTax: totalOf(data.lines),
        createdById: ctx.userId,
        lines: { create: data.lines.map((l) => ({ productId: l.productId, quantityOrdered: l.quantityOrdered, unitCost: l.unitCost })) },
      },
      select: { id: true, number: true },
    });
    await audit(ctx, "purchase.created", "PurchaseOrder", po.id, { number }, tx);
    return po;
  });
}

export async function updatePurchaseOrder(ctx: AuthContext, id: string, data: POData) {
  assertCan(ctx, "purchases:write");
  const po = await db.purchaseOrder.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { status: true } });
  if (!po) throw new NotFoundError("Commande fournisseur");
  if (po.status !== "DRAFT") throw new BusinessRuleError("NOT_EDITABLE", "Seule une commande brouillon est modifiable");
  await assertRefs(ctx, data);
  await db.$transaction([
    db.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } }),
    db.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: data.supplierId,
        expectedAt: data.expectedAt,
        supplierInvoiceRef: data.supplierInvoiceRef,
        notes: data.notes,
        totalExclTax: totalOf(data.lines),
        lines: { create: data.lines.map((l) => ({ productId: l.productId, quantityOrdered: l.quantityOrdered, unitCost: l.unitCost })) },
      },
    }),
  ]);
  await audit(ctx, "purchase.updated", "PurchaseOrder", id);
  return { id };
}

/** Passage de commande : n'augmente PAS le stock (seule la réception le fait). */
export async function placePurchaseOrder(ctx: AuthContext, id: string) {
  assertCan(ctx, "purchases:write");
  const r = await db.purchaseOrder.updateMany({ where: { id, organizationId: ctx.organizationId, status: "DRAFT" }, data: { status: "ORDERED", orderedAt: new Date() } });
  if (r.count === 0) throw new BusinessRuleError("INVALID_TRANSITION", "Commande introuvable ou déjà passée");
  await audit(ctx, "purchase.ordered", "PurchaseOrder", id);
  return { id, status: "ORDERED" as const };
}

export async function cancelPurchaseOrder(ctx: AuthContext, id: string) {
  assertCan(ctx, "purchases:write");
  const r = await db.purchaseOrder.updateMany({ where: { id, organizationId: ctx.organizationId, status: { in: ["DRAFT", "ORDERED"] } }, data: { status: "CANCELLED" } });
  if (r.count === 0) throw new BusinessRuleError("INVALID_TRANSITION", "Une commande déjà (partiellement) reçue ne peut pas être annulée");
  await audit(ctx, "purchase.cancelled", "PurchaseOrder", id);
  return { id, status: "CANCELLED" as const };
}

/** Réception effective : seule opération qui crée du stock à partir d'une commande. */
export async function receivePurchaseOrder(ctx: AuthContext, id: string, data: z.output<typeof receiveSchema>) {
  assertCan(ctx, "purchases:receive");
  return withRetry(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Commande fournisseur");
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: { include: { product: { select: { name: true } } } } } });
    if (po.status !== "ORDERED" && po.status !== "PARTIALLY_RECEIVED") throw new BusinessRuleError("INVALID_TRANSITION", "La commande doit être passée avant réception");
    const items = data.lines.filter((l) => l.quantity > 0);
    if (items.length === 0) throw new ValidationError("Saisissez au moins une quantité reçue");
    await lockProducts(tx, ctx.organizationId, po.lines.filter((l) => items.some((i) => i.lineId === l.id)).map((l) => l.productId));
    const receipt = await tx.goodsReceipt.create({ data: { organizationId: ctx.organizationId, purchaseOrderId: id, receivedById: ctx.userId, notes: data.notes }, select: { id: true } });
    for (const item of items) {
      const line = po.lines.find((l) => l.id === item.lineId);
      if (!line) throw new ValidationError("Ligne de commande inconnue");
      const remaining = line.quantityOrdered - line.quantityReceived;
      if (item.quantity > remaining) throw new BusinessRuleError("OVER_RECEIPT", `« ${line.product.name} » : ${remaining} restant(s) à recevoir`);
      await applyMovement(tx, ctx, { type: "RECEIPT", productId: line.productId, quantity: item.quantity, toLocationId: item.locationId, purchaseOrderId: id, reason: `Réception ${po.number}` });
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { quantityReceived: { increment: item.quantity } } });
      await tx.goodsReceiptLine.create({ data: { receiptId: receipt.id, orderLineId: line.id, quantity: item.quantity, locationId: item.locationId } });
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id }, select: { quantityOrdered: true, quantityReceived: true } });
    const complete = lines.every((l) => l.quantityReceived === l.quantityOrdered);
    const status: PurchaseOrderStatus = complete ? "RECEIVED" : "PARTIALLY_RECEIVED";
    await tx.purchaseOrder.update({ where: { id }, data: { status } });
    await audit(ctx, "purchase.received", "PurchaseOrder", id, { receiptId: receipt.id, lines: items.map((i) => `${i.lineId}×${i.quantity}`) }, tx);
    return { id, status, receiptId: receipt.id };
  });
}

export async function listPurchaseOrders(ctx: AuthContext, query: ListQuery & { status?: PurchaseOrderStatus }) {
  assertCan(ctx, "purchases:read");
  const where: Prisma.PurchaseOrderWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { OR: [{ number: { contains: query.q, mode: "insensitive" } }, { supplier: { name: { contains: query.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...paginationArgs(query),
      select: { id: true, number: true, status: true, orderedAt: true, expectedAt: true, totalExclTax: true, createdAt: true, supplier: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
    }),
    db.purchaseOrder.count({ where }),
  ]);
  return paginated(
    rows.map((p) => ({ ...p, totalExclTax: moneyOrZero(p.totalExclTax), orderedAt: p.orderedAt?.toISOString() ?? null, expectedAt: p.expectedAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), lineCount: p._count.lines })),
    total,
    query,
  );
}

export async function getPurchaseOrder(ctx: AuthContext, id: string) {
  assertCan(ctx, "purchases:read");
  const po = await db.purchaseOrder.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true, number: true, status: true, orderedAt: true, expectedAt: true, supplierInvoiceRef: true, notes: true, totalExclTax: true, createdAt: true,
      supplier: { select: { id: true, name: true, email: true } },
      lines: { select: { id: true, quantityOrdered: true, quantityReceived: true, unitCost: true, product: { select: { id: true, sku: true, name: true, defaultLocationId: true } } } },
      receipts: { orderBy: { receivedAt: "desc" }, select: { id: true, receivedAt: true, notes: true, lines: { select: { quantity: true, orderLine: { select: { product: { select: { name: true } } } } } } } },
    },
  });
  if (!po) throw new NotFoundError("Commande fournisseur");
  return {
    ...po,
    totalExclTax: moneyOrZero(po.totalExclTax),
    orderedAt: po.orderedAt?.toISOString() ?? null,
    expectedAt: po.expectedAt?.toISOString() ?? null,
    createdAt: po.createdAt.toISOString(),
    lines: po.lines.map((l) => ({ ...l, unitCost: money(l.unitCost)! })),
    receipts: po.receipts.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() })),
  };
}
