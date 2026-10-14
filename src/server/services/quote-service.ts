import "server-only";
import type { Prisma, QuoteStatus } from "@prisma/client";
import type { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { computeDocumentTotals, dec } from "@/lib/money";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { decimalString, money, moneyOrZero } from "@/lib/serialize";
import type { documentLineSchema, quoteSchema } from "@/features/quotes/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { sendMail, type MailResult } from "../mail";
import { nextDocumentNumber } from "./common";
import { createReservation } from "./reservation-service";

type QuoteData = z.output<typeof quoteSchema>;
export type DocumentLineData = z.output<typeof documentLineSchema>;

/** Calcule les lignes persistées et les totaux (serveur = source de vérité des montants). */
export function buildLines(lines: DocumentLineData[], globalDiscountPercent: string) {
  const totals = computeDocumentTotals(lines, globalDiscountPercent);
  return {
    totals,
    lines: lines.map((l, i) => ({
      position: i + 1,
      kind: l.kind,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      days: l.days,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      vatRate: l.vatRate,
      totalExclTax: totals.lineTotals[i]!,
    })),
  };
}

export async function assertDocumentRefs(ctx: AuthContext, data: { customerId: string; eventId: string | null; lines: DocumentLineData[] }) {
  const customer = await db.customer.findFirst({ where: { id: data.customerId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!customer) throw new ValidationError("Client inconnu", { customerId: ["Introuvable"] });
  if (data.eventId) {
    const event = await db.event.findFirst({ where: { id: data.eventId, organizationId: ctx.organizationId }, select: { customerId: true } });
    if (!event) throw new ValidationError("Événement inconnu", { eventId: ["Introuvable"] });
    if (event.customerId !== data.customerId) throw new ValidationError("L'événement appartient à un autre client", { eventId: ["Client différent"] });
  }
  const productIds = data.lines.map((l) => l.productId).filter((v): v is string => Boolean(v));
  if (productIds.length) {
    const n = await db.equipmentProduct.count({ where: { organizationId: ctx.organizationId, id: { in: productIds } } });
    if (n !== new Set(productIds).size) throw new ValidationError("Produit inconnu dans les lignes");
  }
}

export async function createQuote(ctx: AuthContext, data: QuoteData) {
  assertCan(ctx, "quotes:write");
  await assertDocumentRefs(ctx, data);
  const { totals, lines } = buildLines(data.lines, data.globalDiscountPercent);
  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, ctx.organizationId, "quote", "DEV");
    const quote = await tx.quote.create({
      data: {
        organizationId: ctx.organizationId,
        number,
        customerId: data.customerId,
        eventId: data.eventId,
        title: data.title,
        validUntil: data.validUntil,
        globalDiscountPercent: data.globalDiscountPercent,
        notes: data.notes,
        terms: data.terms,
        totalExclTax: totals.totalExclTax,
        totalTax: totals.totalTax,
        totalInclTax: totals.totalInclTax,
        lines: { create: lines },
      },
      select: { id: true, number: true },
    });
    await audit(ctx, "quote.created", "Quote", quote.id, { number, totalInclTax: totals.totalInclTax }, tx);
    return quote;
  });
}

/** Seul un devis brouillon est modifiable ; après envoi, on crée une nouvelle version. */
export async function updateQuote(ctx: AuthContext, id: string, data: QuoteData) {
  assertCan(ctx, "quotes:write");
  const q = await db.quote.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { status: true } });
  if (!q) throw new NotFoundError("Devis");
  if (q.status !== "DRAFT") throw new BusinessRuleError("NOT_EDITABLE", "Un devis envoyé n'est plus modifiable : créez une nouvelle version");
  await assertDocumentRefs(ctx, data);
  const { totals, lines } = buildLines(data.lines, data.globalDiscountPercent);
  await db.$transaction(async (tx) => {
    await tx.quoteLine.deleteMany({ where: { quoteId: id } });
    await tx.quote.update({
      where: { id },
      data: {
        customerId: data.customerId,
        eventId: data.eventId,
        title: data.title,
        validUntil: data.validUntil,
        globalDiscountPercent: data.globalDiscountPercent,
        notes: data.notes,
        terms: data.terms,
        totalExclTax: totals.totalExclTax,
        totalTax: totals.totalTax,
        totalInclTax: totals.totalInclTax,
        lines: { create: lines },
      },
    });
    await audit(ctx, "quote.updated", "Quote", id, { totalInclTax: totals.totalInclTax }, tx);
  });
  return { id };
}

async function loadForTransition(tx: Tx, ctx: AuthContext, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Quote" WHERE "id" = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("Devis");
  return tx.quote.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, customer: { select: { email: true, name: true } } } });
}

/** Émission (sans e-mail) : le devis est figé et daté ; validité par défaut selon l'organisation. */
export async function issueQuote(ctx: AuthContext, id: string) {
  assertCan(ctx, "quotes:send");
  return db.$transaction(async (tx) => {
    const q = await loadForTransition(tx, ctx, id);
    if (q.status !== "DRAFT") throw new BusinessRuleError("INVALID_TRANSITION", "Seul un brouillon peut être émis");
    if (q.lines.length === 0) throw new BusinessRuleError("EMPTY_QUOTE", "Le devis ne contient aucune ligne");
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { quoteValidityDays: true } });
    const now = new Date();
    await tx.quote.update({
      where: { id },
      data: {
        status: "SENT",
        issueDate: now,
        validUntil: q.validUntil ?? new Date(now.getTime() + org.quoteValidityDays * 86_400_000),
        followUpAt: new Date(now.getTime() + 7 * 86_400_000),
      },
    });
    if (q.eventId) await tx.event.updateMany({ where: { id: q.eventId, status: "DRAFT" }, data: { status: "QUOTED" } });
    await audit(ctx, "quote.issued", "Quote", id, { number: q.number }, tx);
    return { id, status: "SENT" as const };
  });
}

/**
 * Envoi par e-mail sur action explicite. Le devis n'est marqué « envoyé » que si le
 * fournisseur d'e-mail a accepté le message (ou s'il est stocké dans la boîte de dev).
 */
export async function sendQuoteByEmail(ctx: AuthContext, id: string, renderPdf: (ctx: AuthContext, id: string) => Promise<Buffer>): Promise<{ mail: MailResult }> {
  assertCan(ctx, "quotes:send");
  const q = await db.quote.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { status: true, number: true, title: true, totalInclTax: true, customer: { select: { email: true, name: true } } } });
  if (!q) throw new NotFoundError("Devis");
  if (!q.customer.email) throw new BusinessRuleError("NO_EMAIL", "Le client n'a pas d'adresse e-mail");
  if (q.status !== "DRAFT" && q.status !== "SENT") throw new BusinessRuleError("INVALID_TRANSITION", "Ce devis ne peut plus être envoyé");
  if (q.status === "DRAFT") await issueQuote(ctx, id);
  const pdf = await renderPdf(ctx, id);
  const mail = await sendMail({
    to: q.customer.email,
    subject: `Devis ${q.number} — ${q.title}`,
    text: `Bonjour,\n\nVeuillez trouver ci-joint notre devis ${q.number} (${q.title}).\nMontant TTC : ${moneyOrZero(q.totalInclTax)} €.\n\nCordialement,\n${ctx.organization.name}`,
    attachments: [{ filename: `${q.number}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  if (mail.status === "sent" || mail.status === "stored") {
    await db.quote.update({ where: { id }, data: { sentAt: new Date() } });
  }
  await audit(ctx, "quote.email", "Quote", id, { status: mail.status });
  return { mail };
}

/**
 * Acceptation : facultativement, transformation en réservation brouillon des lignes matériel
 * (produits gérés en stock) sur la période de l'événement — à confirmer ensuite (contrôle de stock).
 */
export async function acceptQuote(ctx: AuthContext, id: string, input: { createReservation: boolean }) {
  assertCan(ctx, "quotes:write");
  const q = await db.$transaction(async (tx) => {
    const quote = await loadForTransition(tx, ctx, id);
    if (quote.status !== "SENT") throw new BusinessRuleError("INVALID_TRANSITION", "Seul un devis envoyé peut être accepté");
    await tx.quote.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    // Les autres versions envoyées du même devis deviennent caduques
    const base = quote.number.replace(/-V\d+$/, "");
    await tx.quote.updateMany({ where: { organizationId: ctx.organizationId, id: { not: id }, number: { startsWith: base }, status: { in: ["DRAFT", "SENT"] } }, data: { status: "CANCELLED" } });
    if (quote.eventId) await tx.event.updateMany({ where: { id: quote.eventId, status: { in: ["DRAFT", "QUOTED"] } }, data: { status: "CONFIRMED" } });
    await audit(ctx, "quote.accepted", "Quote", id, { number: quote.number }, tx);
    return quote;
  });
  let reservationId: string | null = null;
  if (input.createReservation) {
    if (!q.eventId) throw new BusinessRuleError("NO_EVENT", "Devis accepté. Associez-le à un événement pour générer la réservation.");
    const equipment = q.lines.filter((l) => l.kind === "EQUIPMENT" && l.productId);
    const managed = await db.equipmentProduct.findMany({ where: { id: { in: equipment.map((l) => l.productId!) }, stockManaged: true }, select: { id: true } });
    const lines = equipment
      .filter((l) => managed.some((m) => m.id === l.productId))
      .map((l) => ({ productId: l.productId!, quantity: Math.ceil(dec(l.quantity).toNumber()) }));
    if (lines.length > 0) {
      const r = await createReservation(ctx, { eventId: q.eventId, lines, notes: `Issue du devis ${q.number}` });
      await db.quote.update({ where: { id }, data: { reservationId: r.id } });
      reservationId = r.id;
    }
  }
  return { id, status: "ACCEPTED" as const, reservationId };
}

export async function setQuoteStatus(ctx: AuthContext, id: string, status: Extract<QuoteStatus, "DECLINED" | "CANCELLED" | "EXPIRED">) {
  assertCan(ctx, "quotes:write");
  const allowed: Record<typeof status, QuoteStatus[]> = { DECLINED: ["SENT"], CANCELLED: ["DRAFT", "SENT"], EXPIRED: ["SENT"] };
  const r = await db.quote.updateMany({
    where: { id, organizationId: ctx.organizationId, status: { in: allowed[status] } },
    data: { status, ...(status === "DECLINED" ? { declinedAt: new Date() } : {}) },
  });
  if (r.count === 0) throw new BusinessRuleError("INVALID_TRANSITION", "Transition impossible depuis le statut actuel");
  await audit(ctx, `quote.${status.toLowerCase()}`, "Quote", id);
  return { id, status };
}

/** Nouvelle version d'un devis envoyé (l'original reste intact). */
export async function reviseQuote(ctx: AuthContext, id: string) {
  assertCan(ctx, "quotes:write");
  return db.$transaction(async (tx) => {
    const q = await loadForTransition(tx, ctx, id);
    if (q.status === "DRAFT") throw new BusinessRuleError("INVALID_TRANSITION", "Modifiez directement le brouillon");
    if (q.status === "ACCEPTED") throw new BusinessRuleError("INVALID_TRANSITION", "Un devis accepté ne peut pas être révisé");
    const base = q.number.replace(/-V\d+$/, "");
    const latest = await tx.quote.aggregate({ where: { organizationId: ctx.organizationId, number: { startsWith: base } }, _max: { version: true } });
    const version = (latest._max.version ?? 1) + 1;
    const copy = await tx.quote.create({
      data: {
        organizationId: ctx.organizationId,
        number: `${base}-V${version}`,
        version,
        customerId: q.customerId,
        eventId: q.eventId,
        title: q.title,
        globalDiscountPercent: q.globalDiscountPercent,
        notes: q.notes,
        terms: q.terms,
        totalExclTax: q.totalExclTax,
        totalTax: q.totalTax,
        totalInclTax: q.totalInclTax,
        lines: { create: q.lines.map(({ id: _id, quoteId: _q, ...l }) => l) },
      },
      select: { id: true, number: true },
    });
    if (q.status === "SENT") await tx.quote.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(ctx, "quote.revised", "Quote", copy.id, { from: q.number, to: copy.number }, tx);
    return copy;
  });
}

export async function listQuotes(ctx: AuthContext, query: ListQuery & { status?: QuoteStatus; customerId?: string; followUp?: boolean }) {
  assertCan(ctx, "quotes:read");
  const now = new Date();
  const where: Prisma.QuoteWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.followUp ? { status: "SENT", followUpAt: { lte: now } } : {}),
    ...(query.q ? { OR: [{ number: { contains: query.q, mode: "insensitive" } }, { title: { contains: query.q, mode: "insensitive" } }, { customer: { name: { contains: query.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.quote.findMany({
      where,
      orderBy: { createdAt: query.dir === "asc" ? "asc" : "desc" },
      ...paginationArgs(query),
      select: { id: true, number: true, title: true, status: true, version: true, issueDate: true, validUntil: true, followUpAt: true, totalExclTax: true, totalInclTax: true, createdAt: true, customer: { select: { id: true, name: true } }, event: { select: { id: true, reference: true, name: true } } },
    }),
    db.quote.count({ where }),
  ]);
  return paginated(
    rows.map((q) => ({
      ...q,
      totalExclTax: moneyOrZero(q.totalExclTax),
      totalInclTax: moneyOrZero(q.totalInclTax),
      issueDate: q.issueDate?.toISOString() ?? null,
      validUntil: q.validUntil?.toISOString() ?? null,
      createdAt: q.createdAt.toISOString(),
      needsFollowUp: q.status === "SENT" && Boolean(q.followUpAt && q.followUpAt <= now),
      isExpired: q.status === "SENT" && Boolean(q.validUntil && q.validUntil < now),
      followUpAt: undefined,
    })),
    total,
    query,
  );
}

export async function getQuote(ctx: AuthContext, id: string) {
  assertCan(ctx, "quotes:read");
  const q = await db.quote.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true, number: true, version: true, title: true, status: true, issueDate: true, validUntil: true, globalDiscountPercent: true, notes: true, terms: true,
      totalExclTax: true, totalTax: true, totalInclTax: true, sentAt: true, acceptedAt: true, declinedAt: true, createdAt: true, reservationId: true, customerId: true, eventId: true,
      customer: { select: { id: true, name: true, email: true } },
      event: { select: { id: true, reference: true, name: true } },
      lines: { orderBy: { position: "asc" }, select: { id: true, kind: true, productId: true, description: true, quantity: true, days: true, unitPrice: true, discountPercent: true, vatRate: true, totalExclTax: true } },
      invoices: { select: { id: true, number: true, status: true } },
    },
  });
  if (!q) throw new NotFoundError("Devis");
  const totals = computeDocumentTotals(q.lines, q.globalDiscountPercent);
  return {
    ...q,
    globalDiscountPercent: decimalString(q.globalDiscountPercent)!,
    totalExclTax: moneyOrZero(q.totalExclTax),
    totalTax: moneyOrZero(q.totalTax),
    totalInclTax: moneyOrZero(q.totalInclTax),
    issueDate: q.issueDate?.toISOString() ?? null,
    validUntil: q.validUntil?.toISOString() ?? null,
    sentAt: q.sentAt?.toISOString() ?? null,
    acceptedAt: q.acceptedAt?.toISOString() ?? null,
    declinedAt: q.declinedAt?.toISOString() ?? null,
    createdAt: q.createdAt.toISOString(),
    vat: totals.vat,
    subtotalExclTax: totals.subtotalExclTax,
    globalDiscountAmount: totals.globalDiscountAmount,
    lines: q.lines.map((l) => ({
      ...l,
      quantity: decimalString(l.quantity)!,
      days: decimalString(l.days)!,
      unitPrice: money(l.unitPrice)!,
      discountPercent: decimalString(l.discountPercent)!,
      vatRate: decimalString(l.vatRate)!,
      totalExclTax: money(l.totalExclTax)!,
    })),
  };
}
