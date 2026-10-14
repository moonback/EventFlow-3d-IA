import "server-only";
import type { LocationKind, Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { decimalString, money } from "@/lib/serialize";
import type { assetSchema, categorySchema, locationSchema, productSchema, stockCountSchema } from "@/features/inventory/schemas";
import { BLOCKING_STATUSES } from "@/features/inventory/availability";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { computeAvailability } from "./availability-service";
import { lockProducts, STORAGE_KINDS, withRetry } from "./common";
import { applyMovement } from "./stock-movement-service";

// ─── Synthèse de stock ─────────────────────────────────────────────────

export interface StockSummary {
  total: number;
  inStorage: number;
  inPreparation: number;
  inReturn: number;
  inTransit: number;
  damaged: number;
  inMaintenance: number;
  reserved: number;
  availableNow: number;
}

const emptySummary = (): StockSummary => ({ total: 0, inStorage: 0, inPreparation: 0, inReturn: 0, inTransit: 0, damaged: 0, inMaintenance: 0, reserved: 0, availableNow: 0 });

/**
 * Synthèse par produit :
 * - total = toutes les unités possédées (y compris sorties) ;
 * - réservé = quantités des réservations actives non encore expédiées (en cours et à venir) ;
 * - disponible maintenant = capacité − pic d'utilisation sur l'heure qui vient.
 */
export async function stockSummaries(organizationId: string, productIds: string[]): Promise<Map<string, StockSummary>> {
  const result = new Map<string, StockSummary>();
  if (productIds.length === 0) return result;
  for (const id of productIds) result.set(id, emptySummary());
  const balances = await db.stockBalance.findMany({
    where: { organizationId, productId: { in: productIds }, quantity: { gt: 0 } },
    select: { productId: true, quantity: true, location: { select: { kind: true } } },
  });
  for (const b of balances) {
    const s = result.get(b.productId)!;
    s.total += b.quantity;
    const kind: LocationKind = b.location.kind;
    if (STORAGE_KINDS.includes(kind)) s.inStorage += b.quantity;
    else if (kind === "PREPARATION") s.inPreparation += b.quantity;
    else if (kind === "RETURN") s.inReturn += b.quantity;
    else if (kind === "OUT") s.inTransit += b.quantity;
    else if (kind === "QUARANTINE") s.damaged += b.quantity;
    else if (kind === "MAINTENANCE") s.inMaintenance += b.quantity;
  }
  const now = new Date();
  const reserved = await db.reservationLine.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, reservation: { organizationId, status: { in: ["CONFIRMED", "IN_PREPARATION", "PREPARED"] }, endAt: { gt: now } } },
    _sum: { quantity: true },
  });
  for (const r of reserved) result.get(r.productId)!.reserved = r._sum.quantity ?? 0;
  const availability = await computeAvailability(db, organizationId, productIds, now, new Date(now.getTime() + 3_600_000), { now });
  for (const [id, a] of availability) result.get(id)!.availableNow = Math.max(0, a.available);
  return result;
}

// ─── Catégories ────────────────────────────────────────────────────────

export async function listCategories(ctx: AuthContext) {
  assertCan(ctx, "inventory:read");
  const rows = await db.equipmentCategory.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, color: true, sortOrder: true, _count: { select: { products: { where: { archivedAt: null } } } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, code: c.code, color: c.color, sortOrder: c.sortOrder, productCount: c._count.products }));
}

export async function createCategory(ctx: AuthContext, data: z.output<typeof categorySchema>) {
  assertCan(ctx, "inventory:write");
  const c = await db.equipmentCategory.create({ data: { organizationId: ctx.organizationId, ...data }, select: { id: true } });
  await audit(ctx, "category.created", "EquipmentCategory", c.id, { name: data.name });
  return c;
}

export async function updateCategory(ctx: AuthContext, id: string, data: z.output<typeof categorySchema>) {
  assertCan(ctx, "inventory:write");
  const r = await db.equipmentCategory.updateMany({ where: { id, organizationId: ctx.organizationId }, data });
  if (r.count === 0) throw new NotFoundError("Catégorie");
  return { id };
}

// ─── Produits ──────────────────────────────────────────────────────────

async function assertProductRefs(ctx: AuthContext, data: z.output<typeof productSchema>) {
  const [cat, sup, loc] = await Promise.all([
    db.equipmentCategory.findFirst({ where: { id: data.categoryId, organizationId: ctx.organizationId }, select: { id: true } }),
    data.supplierId ? db.supplier.findFirst({ where: { id: data.supplierId, organizationId: ctx.organizationId }, select: { id: true } }) : true,
    data.defaultLocationId ? db.stockLocation.findFirst({ where: { id: data.defaultLocationId, organizationId: ctx.organizationId, kind: { in: STORAGE_KINDS } }, select: { id: true } }) : true,
  ]);
  if (!cat) throw new ValidationError("Catégorie inconnue", { categoryId: ["Introuvable"] });
  if (!sup) throw new ValidationError("Fournisseur inconnu", { supplierId: ["Introuvable"] });
  if (!loc) throw new ValidationError("Emplacement de rangement invalide", { defaultLocationId: ["Doit être un emplacement de stockage"] });
}

export async function listProducts(
  ctx: AuthContext,
  query: ListQuery & { categoryId?: string; archived?: boolean; lowStock?: boolean; locationId?: string },
) {
  assertCan(ctx, "inventory:read");
  const where: Prisma.EquipmentProductWhereInput = {
    organizationId: ctx.organizationId,
    archivedAt: query.archived ? { not: null } : null,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.locationId ? { balances: { some: { locationId: query.locationId, quantity: { gt: 0 } } } } : {}),
    ...(query.q
      ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { sku: { contains: query.q, mode: "insensitive" } }, { barcode: query.q }] }
      : {}),
  };
  const sortable = { name: "name", sku: "sku", createdAt: "createdAt" } as const;
  const sortField = sortable[(query.sort ?? "name") as keyof typeof sortable] ?? "name";

  // Filtre « sous le seuil » : calculé sur la synthèse (catalogue < quelques milliers de références)
  if (query.lowStock) {
    const all = await db.equipmentProduct.findMany({ where: { ...where, stockManaged: true }, select: { id: true, alertThreshold: true } });
    const summaries = await stockSummaries(ctx.organizationId, all.map((p) => p.id));
    const lowIds = all.filter((p) => summaries.get(p.id)!.availableNow <= p.alertThreshold && p.alertThreshold > 0).map((p) => p.id);
    where.id = { in: lowIds };
  }

  const [rows, total] = await Promise.all([
    db.equipmentProduct.findMany({
      where,
      orderBy: { [sortField]: query.dir },
      ...paginationArgs(query),
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        stockManaged: true,
        alertThreshold: true,
        rentalPrice: true,
        archivedAt: true,
        photoDocumentId: true,
        category: { select: { id: true, name: true, color: true } },
        defaultLocation: { select: { code: true } },
      },
    }),
    db.equipmentProduct.count({ where }),
  ]);
  const summaries = await stockSummaries(ctx.organizationId, rows.filter((r) => r.stockManaged).map((r) => r.id));
  return paginated(
    rows.map((p) => {
      const s = summaries.get(p.id);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        stockManaged: p.stockManaged,
        category: p.category,
        location: p.defaultLocation?.code ?? null,
        rentalPrice: money(p.rentalPrice),
        archived: Boolean(p.archivedAt),
        hasPhoto: Boolean(p.photoDocumentId),
        alertThreshold: p.alertThreshold,
        stock: s ?? null,
        lowStock: Boolean(s && p.alertThreshold > 0 && s.availableNow <= p.alertThreshold),
      };
    }),
    total,
    query,
  );
}

export async function getProduct(ctx: AuthContext, id: string) {
  assertCan(ctx, "inventory:read");
  const p = await db.equipmentProduct.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true, sku: true, barcode: true, name: true, description: true, unit: true, stockManaged: true, serialized: true, alertThreshold: true,
      purchasePrice: true, rentalPrice: true, replacementValue: true, weightKg: true, volumeM3: true, lengthCm: true, widthCm: true, heightCm: true,
      archivedAt: true, createdAt: true, photoDocumentId: true, categoryId: true, supplierId: true, defaultLocationId: true,
      category: { select: { id: true, name: true, color: true } },
      supplier: { select: { id: true, name: true } },
      defaultLocation: { select: { id: true, code: true, name: true } },
      balances: { where: { quantity: { gt: 0 } }, orderBy: { location: { code: "asc" } }, select: { quantity: true, location: { select: { id: true, code: true, name: true, kind: true } } } },
      assets: { orderBy: { serialNumber: "asc" }, select: { id: true, serialNumber: true, status: true, notes: true, location: { select: { code: true } } } },
      maintenanceTickets: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true, reference: true, title: true, quantity: true, status: true } },
    },
  });
  if (!p) throw new NotFoundError("Produit");
  const summary = p.stockManaged ? (await stockSummaries(ctx.organizationId, [p.id])).get(p.id)! : null;
  const upcoming = await db.reservationLine.findMany({
    where: { productId: id, reservation: { organizationId: ctx.organizationId, status: { in: BLOCKING_STATUSES }, endAt: { gt: new Date(Date.now() - 7 * 86_400_000) } } },
    orderBy: { reservation: { startAt: "asc" } },
    take: 30,
    select: { quantity: true, quantityShipped: true, reservation: { select: { id: true, reference: true, status: true, startAt: true, endAt: true, event: { select: { id: true, name: true } } } } },
  });
  const canPrices = ctx.permissions.has("finance:read") || ctx.permissions.has("inventory:write");
  return {
    ...p,
    purchasePrice: canPrices ? money(p.purchasePrice) : null,
    rentalPrice: money(p.rentalPrice),
    replacementValue: canPrices ? money(p.replacementValue) : null,
    weightKg: decimalString(p.weightKg),
    volumeM3: decimalString(p.volumeM3),
    archivedAt: p.archivedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    summary,
    reservations: upcoming.map((u) => ({ quantity: u.quantity, shipped: u.quantityShipped, ...u.reservation, startAt: u.reservation.startAt.toISOString(), endAt: u.reservation.endAt.toISOString() })),
  };
}

export async function createProduct(ctx: AuthContext, data: z.output<typeof productSchema>) {
  assertCan(ctx, "inventory:write");
  await assertProductRefs(ctx, data);
  const p = await db.equipmentProduct.create({ data: { organizationId: ctx.organizationId, ...data }, select: { id: true, sku: true } });
  await audit(ctx, "product.created", "EquipmentProduct", p.id, { sku: p.sku, name: data.name });
  return p;
}

export async function updateProduct(ctx: AuthContext, id: string, data: z.output<typeof productSchema>) {
  assertCan(ctx, "inventory:write");
  const existing = await db.equipmentProduct.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, stockManaged: true } });
  if (!existing) throw new NotFoundError("Produit");
  await assertProductRefs(ctx, data);
  if (existing.stockManaged && !data.stockManaged) {
    const held = await db.stockBalance.aggregate({ where: { productId: id }, _sum: { quantity: true } });
    if ((held._sum.quantity ?? 0) > 0) throw new BusinessRuleError("STOCK_PRESENT", "Impossible de ne plus gérer en stock un produit qui a du stock : soldez-le d'abord");
  }
  await db.equipmentProduct.update({ where: { id }, data });
  await audit(ctx, "product.updated", "EquipmentProduct", id, { sku: data.sku, name: data.name });
  return { id };
}

export async function setProductArchived(ctx: AuthContext, id: string, archived: boolean) {
  assertCan(ctx, "inventory:write");
  if (archived) {
    const active = await db.reservationLine.count({ where: { productId: id, reservation: { organizationId: ctx.organizationId, status: { in: BLOCKING_STATUSES } } } });
    if (active > 0) throw new BusinessRuleError("PRODUCT_IN_USE", "Ce produit figure dans des réservations actives");
  }
  const r = await db.equipmentProduct.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { archivedAt: archived ? new Date() : null } });
  if (r.count === 0) throw new NotFoundError("Produit");
  await audit(ctx, archived ? "product.archived" : "product.restored", "EquipmentProduct", id);
}

export async function productOptions(ctx: AuthContext) {
  assertCan(ctx, "inventory:read");
  const rows = await db.equipmentProduct.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, sku: true, name: true, rentalPrice: true, stockManaged: true, unit: true, category: { select: { name: true } } },
  });
  return rows.map((r) => ({ value: r.id, label: `${r.name} (${r.sku})`, sku: r.sku, name: r.name, rentalPrice: money(r.rentalPrice), stockManaged: r.stockManaged, unit: r.unit, category: r.category.name }));
}

// ─── Emplacements ──────────────────────────────────────────────────────

export async function listLocations(ctx: AuthContext) {
  assertCan(ctx, "stock:read");
  const rows = await db.stockLocation.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true, kind: true, parentId: true, isActive: true, description: true, balances: { where: { quantity: { gt: 0 } }, select: { quantity: true } } },
  });
  return rows.map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    kind: l.kind,
    parentId: l.parentId,
    isActive: l.isActive,
    description: l.description,
    productCount: l.balances.length,
    unitCount: l.balances.reduce((a, b) => a + b.quantity, 0),
  }));
}

export async function locationOptions(ctx: AuthContext, kinds?: LocationKind[]) {
  assertCan(ctx, "stock:read");
  const rows = await db.stockLocation.findMany({
    where: { organizationId: ctx.organizationId, isActive: true, ...(kinds ? { kind: { in: kinds } } : {}) },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, kind: true },
  });
  return rows.map((r) => ({ value: r.id, label: `${r.code} — ${r.name}`, kind: r.kind }));
}

export async function getLocation(ctx: AuthContext, id: string) {
  assertCan(ctx, "stock:read");
  const l = await db.stockLocation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true, code: true, name: true, kind: true, description: true, isActive: true,
      parent: { select: { id: true, code: true, name: true } },
      children: { select: { id: true, code: true, name: true, kind: true }, orderBy: { code: "asc" } },
      balances: {
        where: { quantity: { gt: 0 } },
        orderBy: { product: { name: "asc" } },
        select: { quantity: true, product: { select: { id: true, sku: true, name: true, unit: true, alertThreshold: true, category: { select: { name: true, color: true } } } } },
      },
    },
  });
  if (!l) throw new NotFoundError("Emplacement");
  return l;
}

export async function createLocation(ctx: AuthContext, data: z.output<typeof locationSchema>) {
  assertCan(ctx, "inventory:write");
  if (data.parentId) {
    const parent = await db.stockLocation.findFirst({ where: { id: data.parentId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!parent) throw new ValidationError("Emplacement parent inconnu", { parentId: ["Introuvable"] });
  }
  const l = await db.stockLocation.create({ data: { organizationId: ctx.organizationId, ...data }, select: { id: true } });
  await audit(ctx, "location.created", "StockLocation", l.id, { code: data.code, kind: data.kind });
  return l;
}

export async function updateLocation(ctx: AuthContext, id: string, data: z.output<typeof locationSchema>) {
  assertCan(ctx, "inventory:write");
  const existing = await db.stockLocation.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, kind: true } });
  if (!existing) throw new NotFoundError("Emplacement");
  if (data.parentId === id) throw new ValidationError("Un emplacement ne peut pas être son propre parent");
  if (existing.kind !== data.kind || !data.isActive) {
    const held = await db.stockBalance.aggregate({ where: { locationId: id }, _sum: { quantity: true } });
    if ((held._sum.quantity ?? 0) > 0) throw new BusinessRuleError("LOCATION_NOT_EMPTY", "Videz l'emplacement avant de changer sa nature ou de le désactiver");
  }
  await db.stockLocation.update({ where: { id }, data });
  await audit(ctx, "location.updated", "StockLocation", id, { code: data.code });
  return { id };
}

// ─── Inventaire (comptage) ─────────────────────────────────────────────

/** Comptage d'un emplacement : chaque écart produit un ajustement tracé (+/−) avec motif. */
export async function recordStockCount(ctx: AuthContext, data: z.output<typeof stockCountSchema>) {
  assertCan(ctx, "stock:write");
  return withRetry(async (tx) => {
    const location = await tx.stockLocation.findFirst({ where: { id: data.locationId, organizationId: ctx.organizationId }, select: { id: true, code: true, kind: true } });
    if (!location) throw new NotFoundError("Emplacement");
    if (location.kind === "OUT") throw new BusinessRuleError("INVALID_LOCATION", "Le matériel sorti ne peut pas être inventorié");
    await lockProducts(tx, ctx.organizationId, data.counts.map((c) => c.productId));
    const adjustments: { productId: string; before: number; counted: number }[] = [];
    for (const count of data.counts) {
      const balance = await tx.stockBalance.findUnique({ where: { productId_locationId: { productId: count.productId, locationId: location.id } }, select: { quantity: true } });
      const before = balance?.quantity ?? 0;
      const delta = count.countedQuantity - before;
      if (delta === 0) continue;
      await applyMovement(tx, ctx, {
        type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
        productId: count.productId,
        quantity: Math.abs(delta),
        ...(delta > 0 ? { toLocationId: location.id } : { fromLocationId: location.id }),
        reason: `Inventaire ${location.code} : ${data.reason} (compté ${count.countedQuantity}, attendu ${before})`,
      });
      adjustments.push({ productId: count.productId, before, counted: count.countedQuantity });
    }
    await audit(ctx, "stock.count", "StockLocation", location.id, { reason: data.reason, adjustments: adjustments.map((a) => `${a.productId}: ${a.before}→${a.counted}`) }, tx);
    return { adjustments };
  });
}

// ─── Unités sérialisées ────────────────────────────────────────────────

export async function addAsset(ctx: AuthContext, productId: string, data: z.output<typeof assetSchema>) {
  assertCan(ctx, "inventory:write");
  const p = await db.equipmentProduct.findFirst({ where: { id: productId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!p) throw new NotFoundError("Produit");
  if (data.locationId) {
    const l = await db.stockLocation.findFirst({ where: { id: data.locationId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!l) throw new ValidationError("Emplacement inconnu");
  }
  const a = await db.equipmentAsset.create({ data: { organizationId: ctx.organizationId, productId, ...data }, select: { id: true } });
  await audit(ctx, "asset.created", "EquipmentAsset", a.id, { serialNumber: data.serialNumber });
  return a;
}

export async function setAssetStatus(ctx: AuthContext, assetId: string, status: "AVAILABLE" | "OUT" | "DAMAGED" | "MAINTENANCE" | "LOST" | "RETIRED") {
  assertCan(ctx, "inventory:write");
  const r = await db.equipmentAsset.updateMany({ where: { id: assetId, organizationId: ctx.organizationId }, data: { status } });
  if (r.count === 0) throw new NotFoundError("Unité");
  await audit(ctx, "asset.status_changed", "EquipmentAsset", assetId, { status });
}

/** Recherche globale du catalogue (barre de recherche, entrepôt 3D). */
export async function findProductLocations(ctx: AuthContext, q: string) {
  assertCan(ctx, "inventory:read");
  const rows = await db.equipmentProduct.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null, OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { barcode: q }] },
    take: 10,
    orderBy: { name: "asc" },
    select: { id: true, sku: true, name: true, balances: { where: { quantity: { gt: 0 } }, select: { quantity: true, location: { select: { id: true, code: true, kind: true } } } } },
  });
  return rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name, locations: r.balances.map((b) => ({ ...b.location, quantity: b.quantity })) }));
}
