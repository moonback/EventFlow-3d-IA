import "server-only";
import type { LocationKind, MovementType } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { isStorageKind, lockProducts, withRetry } from "./common";

export interface MovementInput {
  type: MovementType;
  productId: string;
  quantity: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  reason?: string | null;
  reservationId?: string | null;
  purchaseOrderId?: string | null;
  maintenanceTicketId?: string | null;
  reversesId?: string | null;
  occurredAt?: Date;
}

type Actor = Pick<AuthContext, "organizationId" | "userId">;

/** Règles de cohérence source → destination par type de mouvement. */
const RULES: Record<MovementType, { from: "required" | "none" | "any"; to: "required" | "none" | "any"; fromKinds?: LocationKind[]; toKinds?: LocationKind[] }> = {
  RECEIPT: { from: "none", to: "required", toKinds: ["WAREHOUSE", "ZONE", "RACK", "BIN", "RETURN"] },
  TRANSFER: { from: "required", to: "required", fromKinds: ["WAREHOUSE", "ZONE", "RACK", "BIN", "RETURN"], toKinds: ["WAREHOUSE", "ZONE", "RACK", "BIN"] },
  PREPARATION: { from: "required", to: "required", fromKinds: ["WAREHOUSE", "ZONE", "RACK", "BIN", "RETURN"], toKinds: ["PREPARATION"] },
  UNPREPARE: { from: "required", to: "required", fromKinds: ["PREPARATION"], toKinds: ["WAREHOUSE", "ZONE", "RACK", "BIN"] },
  SHIPMENT: { from: "required", to: "required", fromKinds: ["PREPARATION"], toKinds: ["OUT"] },
  RETURN: { from: "required", to: "required", fromKinds: ["OUT"], toKinds: ["RETURN", "WAREHOUSE", "ZONE", "RACK", "BIN"] },
  RETURN_DAMAGED: { from: "required", to: "required", fromKinds: ["OUT"], toKinds: ["QUARANTINE"] },
  MAINTENANCE_IN: { from: "required", to: "required", toKinds: ["MAINTENANCE", "QUARANTINE"] },
  MAINTENANCE_OUT: { from: "required", to: "required", fromKinds: ["MAINTENANCE", "QUARANTINE"], toKinds: ["WAREHOUSE", "ZONE", "RACK", "BIN"] },
  LOSS: { from: "required", to: "none" },
  ADJUSTMENT_IN: { from: "none", to: "required", toKinds: ["WAREHOUSE", "ZONE", "RACK", "BIN", "RETURN", "QUARANTINE", "MAINTENANCE"] },
  ADJUSTMENT_OUT: { from: "required", to: "none" },
  REVERSAL: { from: "any", to: "any" },
};

/**
 * Applique un mouvement dans la transaction fournie : contrôle des emplacements, décrément
 * conditionnel du solde source (jamais négatif), incrément du solde destination, écriture
 * du journal. L'appelant doit avoir verrouillé les produits concernés (lockProducts).
 */
export async function applyMovement(tx: Tx, actor: Actor, input: MovementInput) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ValidationError("La quantité doit être un entier strictement positif");
  }
  const rule = RULES[input.type];
  const fromId = input.fromLocationId ?? null;
  const toId = input.toLocationId ?? null;
  if (rule.from === "required" && !fromId) throw new ValidationError("Emplacement source requis");
  if (rule.from === "none" && fromId) throw new ValidationError("Ce mouvement n'a pas d'emplacement source");
  if (rule.to === "required" && !toId) throw new ValidationError("Emplacement de destination requis");
  if (rule.to === "none" && toId) throw new ValidationError("Ce mouvement n'a pas de destination");
  if (fromId && toId && fromId === toId) throw new ValidationError("Source et destination identiques");

  const product = await tx.equipmentProduct.findFirst({
    where: { id: input.productId, organizationId: actor.organizationId },
    select: { id: true, stockManaged: true, name: true },
  });
  if (!product) throw new NotFoundError("Produit");
  if (!product.stockManaged) throw new BusinessRuleError("NOT_STOCK_MANAGED", `« ${product.name} » n'est pas géré en stock`);

  const locIds = [fromId, toId].filter((v): v is string => Boolean(v));
  const locations = await tx.stockLocation.findMany({
    where: { id: { in: locIds }, organizationId: actor.organizationId },
    select: { id: true, kind: true, isActive: true, code: true },
  });
  const from = fromId ? locations.find((l) => l.id === fromId) : undefined;
  const to = toId ? locations.find((l) => l.id === toId) : undefined;
  if ((fromId && !from) || (toId && !to)) throw new NotFoundError("Emplacement");
  if (to && !to.isActive) throw new BusinessRuleError("LOCATION_INACTIVE", `L'emplacement ${to.code} est désactivé`);
  if (from && rule.fromKinds && !rule.fromKinds.includes(from.kind)) {
    throw new BusinessRuleError("INVALID_SOURCE", `Source ${from.code} incompatible avec ce type de mouvement`);
  }
  if (to && rule.toKinds && !rule.toKinds.includes(to.kind)) {
    throw new BusinessRuleError("INVALID_DESTINATION", `Destination ${to.code} incompatible avec ce type de mouvement`);
  }

  if (from) {
    // Décrément atomique conditionnel : impossible de passer sous zéro, même en concurrence
    const updated = await tx.$executeRaw`
      UPDATE "StockBalance" SET "quantity" = "quantity" - ${input.quantity}, "updatedAt" = NOW()
      WHERE "productId" = ${product.id} AND "locationId" = ${from.id} AND "quantity" >= ${input.quantity}`;
    if (updated !== 1) {
      const balance = await tx.stockBalance.findUnique({
        where: { productId_locationId: { productId: product.id, locationId: from.id } },
        select: { quantity: true },
      });
      throw new BusinessRuleError(
        "INSUFFICIENT_STOCK_AT_LOCATION",
        `Quantité insuffisante pour « ${product.name} » en ${from.code} (présent : ${balance?.quantity ?? 0}, demandé : ${input.quantity})`,
        { productId: product.id, locationId: from.id, onHand: balance?.quantity ?? 0, requested: input.quantity },
      );
    }
  }
  if (to) {
    await tx.$executeRaw`
      INSERT INTO "StockBalance" ("id", "organizationId", "productId", "locationId", "quantity", "updatedAt")
      VALUES (${`bal_${product.id}_${to.id}`}, ${actor.organizationId}, ${product.id}, ${to.id}, ${input.quantity}, NOW())
      ON CONFLICT ("productId", "locationId")
      DO UPDATE SET "quantity" = "StockBalance"."quantity" + EXCLUDED."quantity", "updatedAt" = NOW()`;
  }

  return tx.stockMovement.create({
    data: {
      organizationId: actor.organizationId,
      type: input.type,
      productId: product.id,
      quantity: input.quantity,
      fromLocationId: from?.id ?? null,
      toLocationId: to?.id ?? null,
      reason: input.reason ?? null,
      userId: actor.userId,
      reservationId: input.reservationId ?? null,
      purchaseOrderId: input.purchaseOrderId ?? null,
      maintenanceTicketId: input.maintenanceTicketId ?? null,
      reversesId: input.reversesId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
    select: { id: true, type: true, quantity: true },
  });
}

/** Mouvements saisissables manuellement (les autres sont produits par les workflows). */
export const MANUAL_MOVEMENT_TYPES = ["RECEIPT", "TRANSFER", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "LOSS"] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

export async function recordManualMovement(
  ctx: AuthContext,
  input: { type: ManualMovementType; productId: string; quantity: number; fromLocationId?: string | null; toLocationId?: string | null; reason: string },
) {
  assertCan(ctx, "stock:write");
  if (input.type !== "TRANSFER" && input.reason.trim().length < 3) {
    throw new ValidationError("Un motif est obligatoire pour ce mouvement", { reason: ["Motif obligatoire"] });
  }
  return withRetry(async (tx) => {
    await lockProducts(tx, ctx.organizationId, [input.productId]);
    const movement = await applyMovement(tx, ctx, input);
    await audit(ctx, `stock.${input.type.toLowerCase()}`, "StockMovement", movement.id, {
      productId: input.productId,
      quantity: input.quantity,
      reason: input.reason,
    }, tx);
    return movement;
  });
}

/** Annule un mouvement manuel par un mouvement compensatoire (le journal n'est jamais modifié). */
export async function reverseMovement(ctx: AuthContext, movementId: string, reason: string) {
  assertCan(ctx, "stock:write");
  if (reason.trim().length < 3) throw new ValidationError("Motif obligatoire", { reason: ["Motif obligatoire"] });
  return withRetry(async (tx) => {
    const original = await tx.stockMovement.findFirst({
      where: { id: movementId, organizationId: ctx.organizationId },
      select: { id: true, type: true, productId: true, quantity: true, fromLocationId: true, toLocationId: true, purchaseOrderId: true, reversedBy: { select: { id: true } } },
    });
    if (!original) throw new NotFoundError("Mouvement");
    if (original.reversedBy) throw new BusinessRuleError("ALREADY_REVERSED", "Ce mouvement a déjà été compensé");
    if (!(MANUAL_MOVEMENT_TYPES as readonly string[]).includes(original.type) || original.purchaseOrderId) {
      throw new BusinessRuleError("NOT_REVERSIBLE", "Seuls les mouvements manuels peuvent être compensés ; utilisez le workflow concerné");
    }
    await lockProducts(tx, ctx.organizationId, [original.productId]);
    const movement = await applyMovement(tx, ctx, {
      type: "REVERSAL",
      productId: original.productId,
      quantity: original.quantity,
      fromLocationId: original.toLocationId,
      toLocationId: original.fromLocationId,
      reason,
      reversesId: original.id,
    });
    await audit(ctx, "stock.reversal", "StockMovement", movement.id, { reverses: original.id, reason }, tx);
    return movement;
  });
}

export async function listMovements(
  ctx: AuthContext,
  query: ListQuery & { productId?: string; locationId?: string; type?: MovementType; reservationId?: string },
) {
  assertCan(ctx, "stock:read");
  const where = {
    organizationId: ctx.organizationId,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.reservationId ? { reservationId: query.reservationId } : {}),
    ...(query.locationId ? { OR: [{ fromLocationId: query.locationId }, { toLocationId: query.locationId }] } : {}),
    ...(query.q ? { product: { OR: [{ name: { contains: query.q, mode: "insensitive" as const } }, { sku: { contains: query.q, mode: "insensitive" as const } }] } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.stockMovement.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      ...paginationArgs(query),
      select: {
        id: true,
        type: true,
        quantity: true,
        reason: true,
        occurredAt: true,
        reversesId: true,
        reversedBy: { select: { id: true } },
        purchaseOrderId: true,
        product: { select: { id: true, sku: true, name: true } },
        fromLocation: { select: { id: true, code: true, name: true } },
        toLocation: { select: { id: true, code: true, name: true } },
        user: { select: { name: true } },
        reservation: { select: { id: true, reference: true } },
      },
    }),
    db.stockMovement.count({ where }),
  ]);
  return paginated(
    rows.map((m) => ({
      ...m,
      occurredAt: m.occurredAt.toISOString(),
      isReversed: Boolean(m.reversedBy),
      reversible: !m.reversedBy && !m.purchaseOrderId && (MANUAL_MOVEMENT_TYPES as readonly string[]).includes(m.type),
      reversedBy: undefined,
    })),
    total,
    query,
  );
}

/**
 * Réconciliation : recalcule les soldes à partir du journal et les compare aux soldes stockés.
 * Retourne les écarts (doit être vide). Utilisé par les tests et le script `npm run stock:reconcile`.
 */
export async function reconcileBalances(organizationId: string) {
  const computed = await db.$queryRaw<{ productId: string; locationId: string; quantity: bigint }[]>`
    SELECT "productId", "locationId", SUM(q)::bigint AS quantity FROM (
      SELECT "productId", "toLocationId" AS "locationId", "quantity" AS q FROM "StockMovement"
        WHERE "organizationId" = ${organizationId} AND "toLocationId" IS NOT NULL
      UNION ALL
      SELECT "productId", "fromLocationId" AS "locationId", -"quantity" AS q FROM "StockMovement"
        WHERE "organizationId" = ${organizationId} AND "fromLocationId" IS NOT NULL
    ) t GROUP BY "productId", "locationId"`;
  const balances = await db.stockBalance.findMany({
    where: { organizationId },
    select: { productId: true, locationId: true, quantity: true },
  });
  const key = (p: string, l: string) => `${p}::${l}`;
  const expected = new Map(computed.map((r) => [key(r.productId, r.locationId), Number(r.quantity)]));
  const actual = new Map(balances.map((b) => [key(b.productId, b.locationId), b.quantity]));
  const discrepancies: { productId: string; locationId: string; journal: number; balance: number }[] = [];
  for (const k of new Set([...expected.keys(), ...actual.keys()])) {
    const j = expected.get(k) ?? 0;
    const b = actual.get(k) ?? 0;
    if (j !== b) {
      const [productId, locationId] = k.split("::") as [string, string];
      discrepancies.push({ productId, locationId, journal: j, balance: b });
    }
  }
  return discrepancies;
}

export function locationIsStorage(kind: LocationKind) {
  return isStorageKind(kind);
}
