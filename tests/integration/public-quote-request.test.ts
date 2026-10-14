import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as publicRequest } from "@/app/api/public/requests/[slug]/route";
import { publicQuoteRequestSchema } from "@/features/opportunities/schemas";
import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";
import {
  getOpportunity,
  getPublicRequestForm,
  listOpportunities,
  PUBLIC_REQUEST_LIMITS,
  setPublicRequestFormEnabled,
  submitPublicQuoteRequest,
  updateOpportunity,
} from "@/server/services/opportunity-service";
import { createOrg, createUserInOrg, uid } from "../helpers/factories";

let owner: AuthContext;
let sales: AuthContext;
let slug: string;
let orgId: string;
let eventTypeId: string;

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const request = (overrides: Record<string, unknown> = {}) =>
  publicQuoteRequestSchema.parse({
    contactName: "Camille Durand",
    contactEmail: `camille-${uid()}@client.test`,
    contactPhone: "06 12 34 56 78",
    companyName: "Durand SA",
    eventTypeId,
    eventDate: inDays(60),
    venue: "Lyon",
    guestCount: "150",
    budget: "12 000",
    message: "Soirée de gala",
    consent: true,
    website: "",
    startedAt: Date.now() - 60_000,
    ...overrides,
  });

beforeAll(async () => {
  const org = await createOrg("Demande");
  orgId = org.id;
  slug = org.slug;
  owner = await createUserInOrg(org.id, "OWNER");
  sales = await createUserInOrg(org.id, "SALES");
  eventTypeId = (await db.eventType.create({ data: { organizationId: org.id, name: "Gala" } })).id;
});

describe("ouverture du formulaire public", () => {
  it("est fermé par défaut : la page et l'envoi répondent introuvable", async () => {
    await expect(getPublicRequestForm(slug)).rejects.toMatchObject({ status: 404 });
    await expect(submitPublicQuoteRequest(slug, request(), ip())).rejects.toMatchObject({ status: 404 });
  });

  it("seul un gestionnaire des paramètres peut l'ouvrir", async () => {
    await expect(setPublicRequestFormEnabled(sales, true)).rejects.toMatchObject({ status: 403 });
    await setPublicRequestFormEnabled(owner, true);
    const form = await getPublicRequestForm(slug);
    expect(form.eventTypes).toEqual([{ id: eventTypeId, name: "Gala" }]);
  });
});

describe("envoi d'une demande", () => {
  it("crée une opportunité au stade Demande et notifie les commerciaux", async () => {
    const input = request();
    await submitPublicQuoteRequest(slug, input, ip());
    const o = await db.opportunity.findFirstOrThrow({ where: { organizationId: orgId, contactEmail: input.contactEmail } });
    expect(o).toMatchObject({ stage: "NEW", source: "PUBLIC_FORM", guestCount: 150, venue: "Lyon", eventTypeId, title: "Gala — Durand SA" });
    expect(o.budget?.toString()).toBe("12000");
    expect(o.reference).toMatch(/^DEM-\d{4}-\d{4}$/);
    const notified = await db.notification.findMany({ where: { organizationId: orgId, type: "QUOTE_REQUEST", link: `/opportunities/${o.id}` } });
    expect(notified.map((n) => n.userId).sort()).toEqual([owner.userId, sales.userId].sort());
  });

  it("rapproche un client existant par e-mail sans en créer", async () => {
    const email = `connu-${uid()}@client.test`;
    const customer = await db.customer.create({ data: { organizationId: orgId, kind: "COMPANY", name: "Client connu", email } });
    const before = await db.customer.count({ where: { organizationId: orgId } });
    await submitPublicQuoteRequest(slug, request({ contactEmail: email }), ip());
    expect((await db.opportunity.findFirstOrThrow({ where: { contactEmail: email } })).customerId).toBe(customer.id);
    expect(await db.customer.count({ where: { organizationId: orgId } })).toBe(before);
  });

  it("refuse un type d'événement d'une autre organisation", async () => {
    const other = await createOrg("Autre");
    const foreignType = await db.eventType.create({ data: { organizationId: other.id, name: "Mariage" } });
    await expect(submitPublicQuoteRequest(slug, request({ eventTypeId: foreignType.id }), ip())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuse une date passée", async () => {
    await expect(submitPublicQuoteRequest(slug, request({ eventDate: inDays(-10) }), ip())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("exige le consentement et un nombre d'invités valide", () => {
    expect(publicQuoteRequestSchema.safeParse({ ...request(), consent: false }).success).toBe(false);
    expect(publicQuoteRequestSchema.safeParse({ ...request(), guestCount: 0 }).success).toBe(false);
  });
});

describe("protection contre les robots et les abus", () => {
  it("le piège à robots répond comme un succès sans rien créer", async () => {
    const input = request({ website: "http://spam.example" });
    await expect(submitPublicQuoteRequest(slug, input, ip())).resolves.toEqual({ ok: true });
    expect(await db.opportunity.count({ where: { contactEmail: input.contactEmail } })).toBe(0);
  });

  it("une soumission plus rapide qu'un humain est ignorée", async () => {
    const input = request({ startedAt: Date.now() - 500 });
    await expect(submitPublicQuoteRequest(slug, input, ip())).resolves.toEqual({ ok: true });
    expect(await db.opportunity.count({ where: { contactEmail: input.contactEmail } })).toBe(0);
  });

  it("limite le nombre de demandes par adresse IP", async () => {
    const address = ip();
    for (let i = 0; i < PUBLIC_REQUEST_LIMITS.perIp; i++) await submitPublicQuoteRequest(slug, request(), address);
    await expect(submitPublicQuoteRequest(slug, request(), address)).rejects.toMatchObject({ status: 429 });
  });

  it("limite le nombre de demandes par organisation", async () => {
    const org = await createOrg("Flood");
    const ctx = await createUserInOrg(org.id, "OWNER");
    await setPublicRequestFormEnabled(ctx, true);
    await db.loginAttempt.createMany({
      data: Array.from({ length: PUBLIC_REQUEST_LIMITS.perOrganization }, () => ({ email: `quote-request:${org.id}`, ipAddress: ip(), success: true })),
    });
    await expect(submitPublicQuoteRequest(org.slug, request({ eventTypeId: null }), ip())).rejects.toMatchObject({ status: 429 });
  });

  it("l'API refuse une origine tierce et valide le corps", async () => {
    const call = (body: unknown, origin?: string) =>
      publicRequest(
        new NextRequest(`http://localhost/api/public/requests/${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": ip(), ...(origin ? { origin } : {}) },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ slug }) },
      );
    expect((await call(request(), "https://evil.example")).status).toBe(403);
    expect((await call({ contactName: "" })).status).toBe(422);
    expect((await call({ ...request(), eventDate: inDays(30) })).status).toBe(200);
  });
});

describe("suivi par l'équipe commerciale", () => {
  it("isole les opportunités par organisation", async () => {
    const other = await createOrg("Isolée");
    const outsider = await createUserInOrg(other.id, "OWNER");
    const mine = await db.opportunity.findFirstOrThrow({ where: { organizationId: orgId } });
    await expect(getOpportunity(outsider, mine.id)).rejects.toMatchObject({ status: 404 });
    expect((await listOpportunities(outsider, { page: 1, pageSize: 25, dir: "asc" })).total).toBe(0);
  });

  it("une perte exige un motif ; la clôture fixe la probabilité et la date", async () => {
    const o = await db.opportunity.findFirstOrThrow({ where: { organizationId: orgId } });
    await updateOpportunity(sales, o.id, { stage: "LOST", estimatedAmount: "9000.00", probability: 40, lossReason: "Budget insuffisant", ownerId: sales.userId, guestCount: null, venue: null });
    const lost = await db.opportunity.findUniqueOrThrow({ where: { id: o.id } });
    expect(lost).toMatchObject({ stage: "LOST", probability: 0, lossReason: "Budget insuffisant", ownerId: sales.userId });
    expect(lost.closedAt).not.toBeNull();

    await updateOpportunity(sales, o.id, { stage: "QUALIFIED", estimatedAmount: null, probability: 30, lossReason: "ignoré", ownerId: null, guestCount: null, venue: null });
    const reopened = await db.opportunity.findUniqueOrThrow({ where: { id: o.id } });
    expect(reopened).toMatchObject({ stage: "QUALIFIED", probability: 30, lossReason: null, closedAt: null, guestCount: 150 });
  });

  it("le responsable doit être membre de l'organisation", async () => {
    const other = await createOrg("Étrangère");
    const stranger = await createUserInOrg(other.id, "SALES");
    const o = await db.opportunity.findFirstOrThrow({ where: { organizationId: orgId } });
    await expect(
      updateOpportunity(sales, o.id, { stage: "NEW", estimatedAmount: null, probability: 10, lossReason: null, ownerId: stranger.userId, guestCount: null, venue: null }),
    ).rejects.toMatchObject({ code: "INVALID_OWNER" });
  });
});
