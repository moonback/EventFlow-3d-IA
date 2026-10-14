import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";
import { DATA_TOOLS, runDataTool, type ToolOutcome } from "@/server/assistant/data-tools";
import { createCustomer, createEvent, createOrg, createProduct, createUserInOrg, day } from "../helpers/factories";

let owner: AuthContext;
let logistics: AuthContext;
let accounting: AuthContext;
let outsiderEventId: string;
let eventId: string;
let eventName: string;
let customerId: string;
let customerName: string;
let productId: string;
let vehicleId: string;

const ok = (r: ToolOutcome) => {
  if (!r.ok) throw new Error(`${r.error} : ${r.message}`);
  return r.output as Record<string, unknown>;
};

beforeAll(async () => {
  const org = await createOrg("Eric");
  owner = await createUserInOrg(org.id, "OWNER");
  logistics = await createUserInOrg(org.id, "LOGISTICS_MANAGER");
  accounting = await createUserInOrg(org.id, "ACCOUNTING");
  const customer = await createCustomer(org.id);
  customerId = customer.id;
  customerName = customer.name;
  const event = await createEvent(org.id, day(14, 18), day(14, 23), customer.id);
  eventId = event.id;
  eventName = event.name;
  productId = (await createProduct(org.id, { name: "Lyre Beam 230", sku: "LYR-230" })).id;
  vehicleId = (await db.vehicle.create({ data: { organizationId: org.id, registration: "AB-123-CD", brand: "Renault", model: "Master", type: "VAN" } })).id;
  const other = await createOrg("Autre");
  outsiderEventId = (await createEvent(other.id, day(15), day(16))).id;
});

describe("exécution des outils « données »", () => {
  it("chaque outil s'exécute sans erreur interne avec des arguments minimaux", async () => {
    const args: Record<string, Record<string, unknown>> = {
      search: { query: "Lyre" },
      get_event: { event_id: eventId },
      get_event_financials: { event_id: eventId },
      get_event_load: { event_id: eventId },
      find_equipment: { query: "LYR" },
      check_availability: { product_id: productId, from: "2031-01-14", to: "2031-01-15" },
      get_vehicle: { vehicle_id: vehicleId },
      find_customer: { query: customerName.slice(0, 10) },
      get_customer: { customer_id: customerId },
    };
    for (const t of DATA_TOOLS) {
      const r = await runDataTool(owner, t.name, args[t.name] ?? {});
      expect(r, t.name).toMatchObject({ ok: true });
    }
  });

  it("retrouve un événement par recherche, avec les heures dans le fuseau de l'agence", async () => {
    const hits = ok(await runDataTool(owner, "search", { query: eventName })) as unknown as { type: string; id: string; title: string; href?: string }[];
    expect(hits).toContainEqual(expect.objectContaining({ type: "event", id: eventId, title: eventName }));
    expect(hits[0]!.href).toBeUndefined();

    const list = ok(await runDataTool(owner, "list_events", { from: "2031-01-14", to: "2031-01-14" }));
    expect(list.total).toBe(1);
    // 18:00 UTC → 19:00 à Paris en janvier
    expect(list.events).toEqual([expect.objectContaining({ id: eventId, startAt: "mardi 2031-01-14 19:00" })]);
    expect(ok(await runDataTool(owner, "list_events", { from: "2031-01-20", to: "2031-01-21" })).total).toBe(0);
  });

  it("retrouve le matériel et son stock", async () => {
    const r = ok(await runDataTool(logistics, "find_equipment", { query: "lyre" }));
    expect(r.products).toEqual([expect.objectContaining({ id: productId, sku: "LYR-230", name: "Lyre Beam 230" })]);
  });

  it("refuse les finances à un rôle sans finance:read, les accorde à la comptabilité", async () => {
    expect(await runDataTool(logistics, "get_event_financials", { event_id: eventId })).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(await runDataTool(logistics, "finance_overview", {})).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(await runDataTool(accounting, "get_event_financials", { event_id: eventId })).toMatchObject({ ok: true });
  });

  it("respecte les retraits de permission propres à l'organisation", async () => {
    await db.rolePermission.create({ data: { organizationId: logistics.organizationId, role: "LOGISTICS_MANAGER", permission: "vehicles:read", granted: false } });
    try {
      const restricted = await createUserInOrg(logistics.organizationId, "LOGISTICS_MANAGER");
      expect(await runDataTool(restricted, "list_vehicles", {})).toMatchObject({ ok: false, error: "FORBIDDEN" });
    } finally {
      await db.rolePermission.deleteMany({ where: { organizationId: logistics.organizationId, role: "LOGISTICS_MANAGER" } });
    }
  });

  it("ne révèle pas un élément d'une autre organisation (NOT_FOUND)", async () => {
    expect(await runDataTool(owner, "get_event", { event_id: outsiderEventId })).toMatchObject({ ok: false, error: "NOT_FOUND" });
    expect(await runDataTool(owner, "get_event_load", { event_id: outsiderEventId })).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("rejette les arguments invalides et les outils inconnus", async () => {
    expect(await runDataTool(owner, "list_events", { from: "demain" })).toMatchObject({ ok: false, error: "INVALID_ARGUMENTS" });
    expect(await runDataTool(owner, "get_event", {})).toMatchObject({ ok: false, error: "INVALID_ARGUMENTS" });
    expect(await runDataTool(owner, "list_events", { from: "2031-02-30" })).toMatchObject({ ok: false, error: "INVALID_ARGUMENTS" });
    expect(await runDataTool(owner, "drop_database", {})).toMatchObject({ ok: false, error: "UNKNOWN_TOOL" });
  });
});
