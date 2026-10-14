import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import type { AuthContext } from "@/server/auth/context";
import { getCustomer, listCustomers, updateCustomer } from "@/server/services/customer-service";
import { getEvent, listEvents } from "@/server/services/event-service";
import { getProduct } from "@/server/services/inventory-service";
import { confirmReservation, createReservation } from "@/server/services/reservation-service";
import { recordManualMovement } from "@/server/services/stock-movement-service";
import { getScene, getScenePanel } from "@/server/services/scene-service";
import { globalSearch } from "@/server/services/search-service";
import { createCustomer, createEvent, createLocations, createOrg, createProduct, createUserInOrg, day } from "../helpers/factories";

let ctxA: AuthContext;
let ctxB: AuthContext;
let readOnlyA: AuthContext;
let customerA: { id: string; name: string };
let productA: { id: string };
let eventA: { id: string };
let locsA: Awaited<ReturnType<typeof createLocations>>;

beforeAll(async () => {
  const orgA = await createOrg("A");
  const orgB = await createOrg("B");
  ctxA = await createUserInOrg(orgA.id, "ADMIN");
  ctxB = await createUserInOrg(orgB.id, "ADMIN");
  readOnlyA = await createUserInOrg(orgA.id, "READ_ONLY");
  customerA = await createCustomer(orgA.id);
  productA = await createProduct(orgA.id, { name: "Console Secrète A" });
  eventA = await createEvent(orgA.id, day(3), day(4), customerA.id);
  locsA = await createLocations(orgA.id);
});

describe("isolation des organisations", () => {
  it("un utilisateur ne peut pas lire les données d'une autre organisation", async () => {
    await expect(getCustomer(ctxB, customerA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getEvent(ctxB, eventA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getProduct(ctxB, productA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getScenePanel(ctxB, "PRODUCT", productA.id)).rejects.toBeInstanceOf(NotFoundError);
    const list = await listCustomers(ctxB, { page: 1, pageSize: 100, dir: "asc" });
    expect(list.items.find((c) => c.id === customerA.id)).toBeUndefined();
    const events = await listEvents(ctxB, { page: 1, pageSize: 100, dir: "asc" });
    expect(events.items.find((e) => e.id === eventA.id)).toBeUndefined();
    const hits = await globalSearch(ctxB, "Secrète");
    expect(hits).toHaveLength(0);
  });

  it("un utilisateur ne peut pas modifier les données d'une autre organisation", async () => {
    await expect(updateCustomer(ctxB, customerA.id, { kind: "COMPANY", name: "Piraté", firstName: null, lastName: null, email: null, phone: null, siret: null, vatNumber: null, notes: null })).rejects.toBeInstanceOf(NotFoundError);
    // Mouvement de stock vers un emplacement d'une autre organisation
    await expect(recordManualMovement(ctxB, { type: "RECEIPT", productId: productA.id, quantity: 5, toLocationId: locsA.rackA.id, reason: "intrusion" })).rejects.toBeInstanceOf(NotFoundError);
    // Réservation sur l'événement d'une autre organisation
    await expect(createReservation(ctxB, { eventId: eventA.id, lines: [{ productId: productA.id, quantity: 1 }] })).rejects.toBeInstanceOf(NotFoundError);
    const unchanged = await db.customer.findUniqueOrThrow({ where: { id: customerA.id } });
    expect(unchanged.name).toBe(customerA.name);
    expect(await db.stockBalance.count({ where: { productId: productA.id } })).toBe(0);
  });

  it("la scène 3D ne renvoie que les ressources de l'organisation", async () => {
    const sceneB = await getScene(ctxB);
    expect(sceneB.items.some((i) => i.businessId === locsA.rackA.id)).toBe(false);
    const sceneA = await getScene(ctxA);
    const rack = sceneA.items.find((i) => i.kind === "STOCK_LOCATION" && i.businessId === locsA.rackA.id);
    expect(rack).toBeDefined();
    expect(rack!.key).toBe(`STOCK_LOCATION:${locsA.rackA.id}`);
  });
});

describe("permissions côté serveur", () => {
  it("un utilisateur en lecture seule ne peut pas modifier le stock", async () => {
    await expect(recordManualMovement(readOnlyA, { type: "RECEIPT", productId: productA.id, quantity: 5, toLocationId: locsA.rackA.id, reason: "test" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateCustomer(readOnlyA, customerA.id, { kind: "COMPANY", name: "X", firstName: null, lastName: null, email: null, phone: null, siret: null, vatNumber: null, notes: null })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCustomer(readOnlyA, customerA.id)).resolves.toBeDefined();
  });

  it("un commercial ne peut pas saisir de mouvement de stock mais peut réserver", async () => {
    const sales = await createUserInOrg(ctxA.organizationId, "SALES");
    await expect(recordManualMovement(sales, { type: "ADJUSTMENT_IN", productId: productA.id, quantity: 1, toLocationId: locsA.rackA.id, reason: "test" })).rejects.toBeInstanceOf(ForbiddenError);
    await recordManualMovement(ctxA, { type: "RECEIPT", productId: productA.id, quantity: 3, toLocationId: locsA.rackA.id, reason: "init" });
    const r = await createReservation(sales, { eventId: eventA.id, lines: [{ productId: productA.id, quantity: 1 }] });
    await expect(confirmReservation(sales, r.id)).resolves.toMatchObject({ status: "CONFIRMED" });
  });

  it("une surcharge de permission par organisation est appliquée", async () => {
    const { loadAuthContext } = await import("@/server/auth/context");
    await db.rolePermission.create({ data: { organizationId: ctxA.organizationId, role: "READ_ONLY", permission: "customers:read", granted: false } });
    const reloaded = await loadAuthContext(readOnlyA.userId, readOnlyA.organizationId);
    await expect(getCustomer(reloaded, customerA.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
