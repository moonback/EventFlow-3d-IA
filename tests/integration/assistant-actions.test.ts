import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";
import { ACTION_TOOLS, actionToolDeclarations, findActionTool } from "@/server/assistant/action-tools";
import { DATA_TOOLS } from "@/server/assistant/data-tools";
import { WORLD_TOOLS } from "@/features/assistant/world-tools";
import { recordManualMovement } from "@/server/services/stock-movement-service";
import { createEvent, createLocations, createOrg, createProduct, createUserInOrg, day } from "../helpers/factories";

let ctx: AuthContext;
let eventId: string;
let eventName: string;
let eventRef: string;
let outsiderEventId: string;
let productId: string;
let rackA: string;
let rackB: string;

const tool = (name: string) => findActionTool(name)!;
const parse = (name: string, args: unknown) => tool(name).input.parse(args);

beforeAll(async () => {
  const org = await createOrg("Actions");
  ctx = await createUserInOrg(org.id, "LOGISTICS_MANAGER");
  const e = await createEvent(org.id, day(10, 8), day(10, 20));
  eventId = e.id;
  eventName = e.name;
  eventRef = e.reference;
  const locations = await createLocations(org.id);
  rackA = locations.rackA.id;
  rackB = locations.rackB.id;
  productId = (await createProduct(org.id, { name: "Lyre wash", sku: "LYR-W" })).id;
  await recordManualMovement(ctx, { type: "RECEIPT", productId, quantity: 6, toLocationId: rackA, reason: "Stock initial" });
  outsiderEventId = (await createEvent((await createOrg("Autre")).id, day(11), day(12))).id;
});

describe("déclarations des outils « actions »", () => {
  it("ont des noms uniques, distincts des autres outils, et n'autorisent pas l'annulation d'événement", () => {
    const names = ACTION_TOOLS.map((t) => t.name);
    const others = new Set([...DATA_TOOLS, ...WORLD_TOOLS].map((t) => t.name));
    expect(names.filter((n) => others.has(n))).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
    for (const d of actionToolDeclarations()) expect(d.description, d.name).toMatch(/confirme à l'écran/);
    expect(tool("change_event_status").input.safeParse({ event_id: eventId, status: "CANCELLED" }).success).toBe(false);
  });
});

describe("aperçu puis exécution", () => {
  it("change_event_status : aperçu tiré de la base, statut inchangé refusé, exécution auditée", async () => {
    const preview = await tool("change_event_status").prepare(ctx, parse("change_event_status", { event_id: eventId, status: "IN_PREPARATION" }));
    expect(preview).toEqual({ title: "Changer le statut de l'événement", details: [`${eventName} (${eventRef})`, "Confirmé → En préparation"], danger: false });
    await expect(tool("change_event_status").prepare(ctx, parse("change_event_status", { event_id: eventId, status: "CONFIRMED" }))).rejects.toMatchObject({ code: "NO_CHANGE" });
    // L'aperçu n'écrit rien
    expect((await db.event.findUniqueOrThrow({ where: { id: eventId } })).status).toBe("CONFIRMED");

    await tool("change_event_status").execute(ctx, parse("change_event_status", { event_id: eventId, status: "IN_PREPARATION" }));
    expect((await db.event.findUniqueOrThrow({ where: { id: eventId } })).status).toBe("IN_PREPARATION");
    expect(await db.auditLog.count({ where: { entityId: eventId, action: "event.status_changed" } })).toBe(1);
  });

  it("add_event_note : le texte dicté est montré tel quel puis enregistré et audité", async () => {
    const args = parse("add_event_note", { event_id: eventId, text: "Prévoir deux rallonges de plus" });
    expect((await tool("add_event_note").prepare(ctx, args)).details).toEqual([`${eventName} (${eventRef})`, "« Prévoir deux rallonges de plus »"]);
    const r = await tool("add_event_note").execute(ctx, args);
    expect(await db.eventNote.findUniqueOrThrow({ where: { id: r.noteId as string } })).toMatchObject({ body: "Prévoir deux rallonges de plus", authorId: ctx.userId });
    expect(await db.auditLog.count({ where: { entityId: eventId, action: "event.note_added" } })).toBe(1);
  });

  it("create_task : échéance en heure locale, priorité par défaut", async () => {
    const args = parse("create_task", { title: "Appeler le traiteur", event_id: eventId, due_date: "2031-01-09" });
    expect((await tool("create_task").prepare(ctx, args)).details).toEqual(["« Appeler le traiteur »", `Événement : ${eventName} (${eventRef})`, "Échéance : jeudi 2031-01-09 00:00", "Priorité : Normale"]);
    const r = await tool("create_task").execute(ctx, args);
    const task = await db.eventTask.findUniqueOrThrow({ where: { id: r.taskId as string } });
    expect(task).toMatchObject({ title: "Appeler le traiteur", eventId, priority: "NORMAL" });
    // Minuit à Paris en janvier = 23:00 UTC la veille
    expect(task.dueAt?.toISOString()).toBe("2031-01-08T23:00:00.000Z");
  });

  it("transfer_stock : quantité disponible vérifiée, mouvement enregistré", async () => {
    await expect(tool("transfer_stock").prepare(ctx, parse("transfer_stock", { product_id: productId, from_location_id: rackA, to_location_id: rackB, quantity: 7 }))).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expect(tool("transfer_stock").prepare(ctx, parse("transfer_stock", { product_id: productId, from_location_id: rackA, to_location_id: rackA, quantity: 1 }))).rejects.toMatchObject({ code: "SAME_LOCATION" });
    const args = parse("transfer_stock", { product_id: productId, from_location_id: rackA, to_location_id: rackB, quantity: 4 });
    expect((await tool("transfer_stock").prepare(ctx, args)).details).toEqual(["4 × Lyre wash (LYR-W)", "A-01 → B-01"]);
    await tool("transfer_stock").execute(ctx, args);
    const balances = await db.stockBalance.findMany({ where: { productId }, select: { locationId: true, quantity: true } });
    expect(Object.fromEntries(balances.map((b) => [b.locationId, b.quantity]))).toEqual({ [rackA]: 2, [rackB]: 4 });
  });

  it("ne révèle ni ne modifie un élément d'une autre organisation", async () => {
    await expect(tool("add_event_note").prepare(ctx, parse("add_event_note", { event_id: outsiderEventId, text: "x" }))).rejects.toMatchObject({ status: 404 });
    await expect(tool("add_event_note").execute(ctx, parse("add_event_note", { event_id: outsiderEventId, text: "x" }))).rejects.toMatchObject({ status: 404 });
    expect(await db.eventNote.count({ where: { eventId: outsiderEventId } })).toBe(0);
  });
});
