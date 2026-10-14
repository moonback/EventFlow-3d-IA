import "server-only";
import type { OpportunityStage, Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { BusinessRuleError, NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { iso, money } from "@/lib/serialize";
import type { opportunityUpdateSchema, publicQuoteRequestSchema } from "@/features/opportunities/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { nextDocumentNumber, notifyRoles, SALES_ROLES } from "./common";

const HOUR = 3_600_000;
/** Plafonds de la page publique (fenêtre glissante d'une heure, stockée dans LoginAttempt). */
export const PUBLIC_REQUEST_LIMITS = { perIp: 5, perOrganization: 30, minFillMs: 3_000 } as const;
const ATTEMPT_PREFIX = "quote-request:";

// ─── Page publique ───────────────────────────────────────────────────────

/** Informations affichées par la page publique — rien d'autre que le nom et les types d'événement. */
export async function getPublicRequestForm(slug: string) {
  const org = await db.organization.findFirst({
    where: { slug, publicRequestFormEnabled: true },
    select: { id: true, name: true, accentColor: true, eventTypes: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
  });
  if (!org) throw new NotFoundError("Formulaire");
  return { name: org.name, accentColor: org.accentColor, eventTypes: org.eventTypes };
}

/**
 * Demande de devis publique : limitation de débit (par IP et par organisation), piège à robots,
 * création d'une opportunité au stade « Demande » et notification des commerciaux.
 * Une soumission détectée comme robot reçoit la même réponse qu'une demande acceptée.
 */
export async function submitPublicQuoteRequest(
  slug: string,
  input: z.output<typeof publicQuoteRequestSchema>,
  ipAddress: string | null,
  now = new Date(),
): Promise<{ ok: true }> {
  const org = await db.organization.findFirst({ where: { slug, publicRequestFormEnabled: true }, select: { id: true } });
  if (!org) throw new NotFoundError("Formulaire");

  const key = `${ATTEMPT_PREFIX}${org.id}`;
  const since = new Date(now.getTime() - HOUR);
  const [byIp, byOrg] = await Promise.all([
    ipAddress ? db.loginAttempt.count({ where: { ipAddress, email: { startsWith: ATTEMPT_PREFIX }, createdAt: { gte: since } } }) : Promise.resolve(0),
    db.loginAttempt.count({ where: { email: key, createdAt: { gte: since } } }),
  ]);
  if (byIp >= PUBLIC_REQUEST_LIMITS.perIp || byOrg >= PUBLIC_REQUEST_LIMITS.perOrganization) {
    throw new RateLimitError("Trop de demandes envoyées. Réessayez dans une heure ou contactez-nous directement.");
  }

  const isBot = input.website.trim() !== "" || (input.startedAt !== undefined && now.getTime() - input.startedAt < PUBLIC_REQUEST_LIMITS.minFillMs);
  await db.loginAttempt.create({ data: { email: key, ipAddress, success: !isBot } });
  if (isBot) return { ok: true };

  const eventDate = new Date(`${input.eventDate}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (eventDate.getTime() < today - 86_400_000 || eventDate.getTime() > today + 5 * 365 * 86_400_000) {
    throw new ValidationError("Date de l'événement invalide", { eventDate: ["Choisissez une date à venir"] });
  }

  const [eventType, customer] = await Promise.all([
    input.eventTypeId
      ? db.eventType.findFirst({ where: { id: input.eventTypeId, organizationId: org.id }, select: { id: true, name: true } })
      : Promise.resolve(null),
    db.customer.findFirst({ where: { organizationId: org.id, email: input.contactEmail, archivedAt: null }, select: { id: true } }),
  ]);
  if (input.eventTypeId && !eventType) throw new ValidationError("Type d'événement inconnu", { eventTypeId: ["Type d'événement inconnu"] });

  const who = input.companyName ?? input.contactName;
  await db.$transaction(async (tx) => {
    const reference = await nextDocumentNumber(tx, org.id, "OPPORTUNITY", "DEM", now);
    const opportunity = await tx.opportunity.create({
      data: {
        organizationId: org.id,
        reference,
        title: `${eventType?.name ?? "Événement"} — ${who}`,
        source: "PUBLIC_FORM",
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        companyName: input.companyName,
        customerId: customer?.id ?? null,
        eventTypeId: eventType?.id ?? null,
        eventDate,
        venue: input.venue,
        guestCount: input.guestCount,
        budget: input.budget,
        message: input.message,
      },
      select: { id: true },
    });
    await audit({ organizationId: org.id, userId: null, ipAddress }, "opportunity.public_request", "Opportunity", opportunity.id, { reference, source: "PUBLIC_FORM" }, tx);
    await notifyRoles(tx, org.id, SALES_ROLES, {
      type: "QUOTE_REQUEST",
      title: `Nouvelle demande de devis ${reference} : ${who}`,
      body: `${input.guestCount} invités · ${input.venue} · le ${input.eventDate.split("-").reverse().join("/")}`,
      link: `/opportunities/${opportunity.id}`,
      dedupeKey: `quote-request:${opportunity.id}`,
    });
  });
  return { ok: true };
}

// ─── Espace de travail ───────────────────────────────────────────────────

const listSelect = {
  id: true, reference: true, title: true, stage: true, source: true, contactName: true, companyName: true,
  eventDate: true, guestCount: true, budget: true, estimatedAmount: true, probability: true, createdAt: true,
  owner: { select: { name: true } },
} satisfies Prisma.OpportunitySelect;

export async function listOpportunities(ctx: AuthContext, query: ListQuery & { stage?: OpportunityStage }) {
  assertCan(ctx, "quotes:read");
  const where: Prisma.OpportunityWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.stage ? { stage: query.stage } : {}),
    ...(query.q
      ? {
          OR: [
            { reference: { contains: query.q, mode: "insensitive" } },
            { title: { contains: query.q, mode: "insensitive" } },
            { contactName: { contains: query.q, mode: "insensitive" } },
            { contactEmail: { contains: query.q, mode: "insensitive" } },
            { companyName: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total, byStage] = await Promise.all([
    db.opportunity.findMany({ where, select: listSelect, orderBy: { createdAt: "desc" }, ...paginationArgs(query) }),
    db.opportunity.count({ where }),
    db.opportunity.groupBy({ by: ["stage"], where: { organizationId: ctx.organizationId }, _count: { _all: true } }),
  ]);
  return {
    ...paginated(
      rows.map((o) => ({
        ...o,
        eventDate: iso(o.eventDate),
        createdAt: o.createdAt.toISOString(),
        budget: money(o.budget),
        estimatedAmount: money(o.estimatedAmount),
        ownerName: o.owner?.name ?? null,
      })),
      total,
      query,
    ),
    counts: Object.fromEntries(byStage.map((s) => [s.stage, s._count._all])) as Partial<Record<OpportunityStage, number>>,
  };
}

export async function getOpportunity(ctx: AuthContext, id: string) {
  assertCan(ctx, "quotes:read");
  const o = await db.opportunity.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      customer: { select: { id: true, name: true } },
      eventType: { select: { name: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  if (!o) throw new NotFoundError("Opportunité");
  return {
    ...o,
    eventDate: iso(o.eventDate),
    closedAt: iso(o.closedAt),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    budget: money(o.budget),
    estimatedAmount: money(o.estimatedAmount),
  };
}

const CLOSED: OpportunityStage[] = ["WON", "LOST"];

export async function updateOpportunity(ctx: AuthContext, id: string, input: z.output<typeof opportunityUpdateSchema>) {
  assertCan(ctx, "quotes:write");
  const current = await db.opportunity.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, stage: true, closedAt: true } });
  if (!current) throw new NotFoundError("Opportunité");
  if (input.ownerId) {
    const member = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId: input.ownerId, isActive: true }, select: { id: true } });
    if (!member) throw new BusinessRuleError("INVALID_OWNER", "Le responsable doit être un membre actif de l'organisation");
  }
  const closed = CLOSED.includes(input.stage);
  const probability = input.stage === "WON" ? 100 : input.stage === "LOST" ? 0 : input.probability;
  await db.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: current.id },
      data: {
        stage: input.stage,
        estimatedAmount: input.estimatedAmount,
        probability,
        lossReason: input.stage === "LOST" ? input.lossReason : null,
        ownerId: input.ownerId,
        ...(input.guestCount !== null ? { guestCount: input.guestCount } : {}),
        ...(input.venue !== null ? { venue: input.venue } : {}),
        closedAt: closed ? (current.closedAt ?? new Date()) : null,
      },
    });
    await audit(ctx, "opportunity.updated", "Opportunity", current.id, { fromStage: current.stage, toStage: input.stage, probability }, tx);
  });
  return { id: current.id, stage: input.stage };
}

// ─── Paramètres ──────────────────────────────────────────────────────────

export async function setPublicRequestFormEnabled(ctx: AuthContext, enabled: boolean) {
  assertCan(ctx, "settings:manage");
  await db.organization.update({ where: { id: ctx.organizationId }, data: { publicRequestFormEnabled: enabled } });
  await audit(ctx, enabled ? "settings.public_form_enabled" : "settings.public_form_disabled", "Organization", ctx.organizationId);
  return { enabled };
}
