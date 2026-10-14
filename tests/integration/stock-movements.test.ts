import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";
import { checkAvailability } from "@/server/services/availability-service";
import { recordStockCount } from "@/server/services/inventory-service";
import { createMaintenanceTicket, resolveMaintenance, startRepair } from "@/server/services/maintenance-service";
import { cancelPurchaseOrder, createPurchaseOrder, placePurchaseOrder, receivePurchaseOrder } from "@/server/services/purchase-service";
import { listMovements, reconcileBalances, recordManualMovement, reverseMovement } from "@/server/services/stock-movement-service";
import { createLocations, createOrg, createProduct, createUserInOrg } from "../helpers/factories";

let ctx: AuthContext;
let locs: Awaited<ReturnType<typeof createLocations>>;

beforeAll(async () => {
  const org = await createOrg("Stock");
  ctx = await createUserInOrg(org.id, "LOGISTICS_MANAGER");
  locs = await createLocations(org.id);
});

const capacityOf = async (productId: string) => (await checkAvailability(ctx, { productIds: [productId], startAt: new Date("2032-01-01"), endAt: new Date("2032-01-02"), applyDefaultBuffers: false }))[0]!;

describe("journal des mouvements", () => {
  it("trace chaque mouvement (date, motif, quantité, emplacements, utilisateur) et reste réconciliable", async () => {
    const p = await createProduct(ctx.organizationId);
    await recordManualMovement(ctx, { type: "RECEIPT", productId: p.id, quantity: 10, toLocationId: locs.rackA.id, reason: "Achat initial" });
    await recordManualMovement(ctx, { type: "TRANSFER", productId: p.id, quantity: 4, fromLocationId: locs.rackA.id, toLocationId: locs.rackB.id, reason: "" });
    const list = await listMovements(ctx, { page: 1, pageSize: 10, dir: "desc", productId: p.id });
    expect(list.items).toHaveLength(2);
    const transfer = list.items.find((m) => m.type === "TRANSFER")!;
    expect(transfer).toMatchObject({ quantity: 4, fromLocation: { code: "A-01" }, toLocation: { code: "B-01" }, user: { name: "User LOGISTICS_MANAGER" } });
    expect(transfer.occurredAt).toBeTruthy();
    await expect(reconcileBalances(ctx.organizationId)).resolves.toEqual([]);
  });

  it("interdit la modification ou la suppression d'un mouvement validé (trigger)", async () => {
    const m = await db.stockMovement.findFirstOrThrow({ where: { organizationId: ctx.organizationId } });
    await expect(db.stockMovement.update({ where: { id: m.id }, data: { quantity: 999 } })).rejects.toThrow(/append-only/);
    await expect(db.stockMovement.delete({ where: { id: m.id } })).rejects.toThrow(/append-only/);
  });

  it("corrige par mouvement compensatoire, une seule fois", async () => {
    const p = await createProduct(ctx.organizationId);
    const m = await recordManualMovement(ctx, { type: "RECEIPT", productId: p.id, quantity: 7, toLocationId: locs.rackA.id, reason: "Erreur de saisie" });
    await reverseMovement(ctx, m.id, "Doublon");
    expect((await capacityOf(p.id)).capacity).toBe(0);
    await expect(reverseMovement(ctx, m.id, "Encore")).rejects.toMatchObject({ code: "ALREADY_REVERSED" });
  });

  it("refuse un solde négatif", async () => {
    const p = await createProduct(ctx.organizationId);
    await recordManualMovement(ctx, { type: "RECEIPT", productId: p.id, quantity: 2, toLocationId: locs.rackA.id, reason: "init" });
    await expect(recordManualMovement(ctx, { type: "LOSS", productId: p.id, quantity: 3, fromLocationId: locs.rackA.id, reason: "casse" })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK_AT_LOCATION" });
  });

  it("justifie les écarts d'inventaire par des ajustements tracés", async () => {
    const p = await createProduct(ctx.organizationId);
    await recordManualMovement(ctx, { type: "RECEIPT", productId: p.id, quantity: 10, toLocationId: locs.rackA.id, reason: "init" });
    const res = await recordStockCount(ctx, { locationId: locs.rackA.id, reason: "Inventaire annuel", counts: [{ productId: p.id, countedQuantity: 8 }] });
    expect(res.adjustments).toEqual([{ productId: p.id, before: 10, counted: 8 }]);
    const adj = await db.stockMovement.findFirstOrThrow({ where: { productId: p.id, type: "ADJUSTMENT_OUT" } });
    expect(adj.quantity).toBe(2);
    expect(adj.reason).toContain("Inventaire annuel");
  });
});

describe("achats fournisseurs", () => {
  it("une commande ne crée pas de stock avant réception effective", async () => {
    const p = await createProduct(ctx.organizationId);
    const supplier = await db.supplier.create({ data: { organizationId: ctx.organizationId, name: "Fournisseur" } });
    const po = await createPurchaseOrder(ctx, { supplierId: supplier.id, expectedAt: null, supplierInvoiceRef: null, notes: null, lines: [{ productId: p.id, quantityOrdered: 12, unitCost: "80.00" }] });
    await placePurchaseOrder(ctx, po.id);
    expect((await capacityOf(p.id)).capacity).toBe(0);
    const line = await db.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const partial = await receivePurchaseOrder(ctx, po.id, { notes: null, lines: [{ lineId: line.id, quantity: 5, locationId: locs.rackA.id }] });
    expect(partial.status).toBe("PARTIALLY_RECEIVED");
    expect((await capacityOf(p.id)).capacity).toBe(5);
    await expect(receivePurchaseOrder(ctx, po.id, { notes: null, lines: [{ lineId: line.id, quantity: 8, locationId: locs.rackA.id }] })).rejects.toMatchObject({ code: "OVER_RECEIPT" });
    const full = await receivePurchaseOrder(ctx, po.id, { notes: null, lines: [{ lineId: line.id, quantity: 7, locationId: locs.rackA.id }] });
    expect(full.status).toBe("RECEIVED");
    await expect(cancelPurchaseOrder(ctx, po.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("maintenance", () => {
  it("le matériel en maintenance est indisponible jusqu'à sa remise en état", async () => {
    const p = await createProduct(ctx.organizationId);
    await recordManualMovement(ctx, { type: "RECEIPT", productId: p.id, quantity: 6, toLocationId: locs.rackA.id, reason: "init" });
    const t = await createMaintenanceTicket(ctx, { productId: p.id, fromLocationId: locs.rackA.id, quantity: 2, title: "Ventilateur bruyant", description: null });
    expect((await capacityOf(p.id)).capacity).toBe(4);
    await expect(startRepair(ctx, t.id)).rejects.toMatchObject({ code: "NOTHING_IN_QUARANTINE" });
    const res = await resolveMaintenance(ctx, t.id, { quantityRepaired: 1, quantityScrapped: 1, toLocationId: locs.rackA.id, cost: "45.50", notes: null });
    expect(res.status).toBe("RESOLVED");
    expect((await capacityOf(p.id)).capacity).toBe(5);
    const expense = await db.expense.findFirstOrThrow({ where: { organizationId: ctx.organizationId, category: "MAINTENANCE" } });
    expect(expense.amountExclTax.toFixed(2)).toBe("45.50");
    await expect(reconcileBalances(ctx.organizationId)).resolves.toEqual([]);
  });
});
