import "server-only";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { computeDocumentTotals, dec, sumMoney } from "@/lib/money";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { decimalString, money, moneyOrZero } from "@/lib/serialize";
import type { creditNoteSchema, expenseSchema, invoiceSchema, paymentSchema } from "@/features/invoices/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { nextDocumentNumber, withRetry } from "./common";
import { assertDocumentRefs, buildLines } from "./quote-service";

type InvoiceData = z.output<typeof invoiceSchema>;

/**
 * Factures — règles :
 * - brouillon librement modifiable, sans numéro ;
 * - émission : numéro séquentiel sans trou (FAC-AAAA-NNNNN), date, échéance, instantané client ;
 * - une facture émise est immuable (contrôlé aussi par trigger PostgreSQL) ; correction par avoir ;
 * - solde dû = TTC − encaissements − avoirs émis.
 */
export async function createInvoice(ctx: AuthContext, data: InvoiceData, quoteId: string | null = null) {
  assertCan(ctx, "invoices:write");
  await assertDocumentRefs(ctx, data);
  const { totals, lines } = buildLines(data.lines, data.globalDiscountPercent);
  const invoice = await db.invoice.create({
    data: {
      organizationId: ctx.organizationId,
      customerId: data.customerId,
      eventId: data.eventId,
      quoteId,
      title: data.title,
      globalDiscountPercent: data.globalDiscountPercent,
      notes: data.notes,
      totalExclTax: totals.totalExclTax,
      totalTax: totals.totalTax,
      totalInclTax: totals.totalInclTax,
      lines: { create: lines },
    },
    select: { id: true },
  });
  await audit(ctx, "invoice.draft_created", "Invoice", invoice.id, { totalInclTax: totals.totalInclTax, quoteId });
  return invoice;
}

export async function createInvoiceFromQuote(ctx: AuthContext, quoteId: string) {
  assertCan(ctx, "invoices:write");
  const q = await db.quote.findFirst({
    where: { id: quoteId, organizationId: ctx.organizationId },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!q) throw new NotFoundError("Devis");
  if (q.status !== "ACCEPTED") throw new BusinessRuleError("QUOTE_NOT_ACCEPTED", "Seul un devis accepté peut être facturé");
  const existing = await db.invoice.findFirst({ where: { quoteId, organizationId: ctx.organizationId, kind: "INVOICE", status: { not: "CANCELLED" } }, select: { id: true } });
  if (existing) throw new BusinessRuleError("ALREADY_INVOICED", "Ce devis a déjà une facture");
  return createInvoice(
    ctx,
    {
      customerId: q.customerId,
      eventId: q.eventId,
      title: q.title,
      globalDiscountPercent: q.globalDiscountPercent.toString(),
      notes: `Selon devis ${q.number}`,
      lines: q.lines.map((l) => ({
        kind: l.kind,
        productId: l.productId,
        description: l.description,
        quantity: l.quantity.toString(),
        days: l.days.toString(),
        unitPrice: l.unitPrice.toFixed(2),
        discountPercent: l.discountPercent.toString(),
        vatRate: l.vatRate.toString(),
      })),
    },
    quoteId,
  );
}

async function lockInvoice(tx: Tx, ctx: AuthContext, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Invoice" WHERE "id" = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("Facture");
  return tx.invoice.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
}

export async function updateInvoiceDraft(ctx: AuthContext, id: string, data: InvoiceData) {
  assertCan(ctx, "invoices:write");
  await assertDocumentRefs(ctx, data);
  const { totals, lines } = buildLines(data.lines, data.globalDiscountPercent);
  return db.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, ctx, id);
    if (inv.status !== "DRAFT") throw new BusinessRuleError("INVOICE_LOCKED", "Une facture émise ne peut pas être modifiée : émettez un avoir");
    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: {
        customerId: data.customerId,
        eventId: data.eventId,
        title: data.title,
        globalDiscountPercent: data.globalDiscountPercent,
        notes: data.notes,
        totalExclTax: totals.totalExclTax,
        totalTax: totals.totalTax,
        totalInclTax: totals.totalInclTax,
        lines: { create: lines },
      },
    });
    await audit(ctx, "invoice.draft_updated", "Invoice", id, { totalInclTax: totals.totalInclTax }, tx);
    return { id };
  });
}

export async function deleteInvoiceDraft(ctx: AuthContext, id: string) {
  assertCan(ctx, "invoices:write");
  await db.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, ctx, id);
    if (inv.status !== "DRAFT") throw new BusinessRuleError("INVOICE_LOCKED", "Une facture émise ne peut pas être supprimée");
    await tx.invoice.delete({ where: { id } });
    await audit(ctx, "invoice.draft_deleted", "Invoice", id, {}, tx);
  });
}

/** Émission : numérotation définitive + figement des données. */
export async function issueInvoice(ctx: AuthContext, id: string) {
  assertCan(ctx, "invoices:issue");
  return withRetry(async (tx) => {
    const inv = await lockInvoice(tx, ctx, id);
    if (inv.status !== "DRAFT") throw new BusinessRuleError("INVALID_TRANSITION", "Facture déjà émise");
    if (inv.lines.length === 0) throw new BusinessRuleError("EMPTY_INVOICE", "La facture ne contient aucune ligne");
    // Recalcul de contrôle : les totaux stockés doivent correspondre aux lignes
    const totals = computeDocumentTotals(inv.lines, inv.globalDiscountPercent);
    if (!dec(totals.totalInclTax).eq(inv.totalInclTax)) throw new BusinessRuleError("TOTALS_MISMATCH", "Incohérence des totaux : réenregistrez le brouillon");
    if (inv.kind === "CREDIT_NOTE") {
      const original = await lockInvoice(tx, ctx, inv.creditedInvoiceId!);
      const credited = await creditedTotal(tx, original.id);
      const remaining = dec(original.totalInclTax).minus(credited).minus(original.amountPaid);
      if (dec(inv.totalInclTax).gt(remaining)) {
        throw new BusinessRuleError("CREDIT_EXCEEDS_BALANCE", `L'avoir (${inv.totalInclTax.toFixed(2)} €) dépasse le solde créditable (${remaining.toFixed(2)} €)`);
      }
    }
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { paymentTermDays: true, name: true, legalName: true, siret: true, vatNumber: true, addressLine1: true, postalCode: true, city: true, country: true },
    });
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: inv.customerId },
      select: { name: true, email: true, siret: true, vatNumber: true, addresses: { where: { kind: "BILLING" }, orderBy: { isDefault: "desc" }, take: 1, select: { line1: true, line2: true, postalCode: true, city: true, country: true } } },
    });
    const now = new Date();
    const number = inv.kind === "CREDIT_NOTE"
      ? await nextDocumentNumber(tx, ctx.organizationId, "credit_note", "AV", now)
      : await nextDocumentNumber(tx, ctx.organizationId, "invoice", "FAC", now, 5);
    await tx.invoice.update({
      where: { id },
      data: {
        number,
        status: "ISSUED",
        issueDate: now,
        issuedAt: now,
        issuedById: ctx.userId,
        dueDate: inv.kind === "CREDIT_NOTE" ? now : new Date(now.getTime() + org.paymentTermDays * 86_400_000),
        billingSnapshot: { seller: org, customer: { name: customer.name, email: customer.email, siret: customer.siret, vatNumber: customer.vatNumber, address: customer.addresses[0] ?? null } },
      },
    });
    if (inv.kind === "CREDIT_NOTE") await refreshInvoiceStatus(tx, inv.creditedInvoiceId!);
    await audit(ctx, inv.kind === "CREDIT_NOTE" ? "credit_note.issued" : "invoice.issued", "Invoice", id, { number, totalInclTax: inv.totalInclTax.toFixed(2) }, tx);
    return { id, number };
  });
}

async function creditedTotal(tx: Tx, invoiceId: string) {
  const agg = await tx.invoice.aggregate({ where: { creditedInvoiceId: invoiceId, kind: "CREDIT_NOTE", status: { not: "DRAFT" } }, _sum: { totalInclTax: true } });
  return dec(agg._sum.totalInclTax ?? 0);
}

/** Statut dérivé des encaissements et avoirs. */
async function refreshInvoiceStatus(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { status: true, totalInclTax: true, amountPaid: true, kind: true } });
  if (inv.status === "DRAFT" || inv.kind === "CREDIT_NOTE") return inv.status;
  const credited = await creditedTotal(tx, invoiceId);
  const due = dec(inv.totalInclTax).minus(credited).minus(inv.amountPaid);
  let status: InvoiceStatus;
  if (due.lte(0)) status = dec(inv.amountPaid).isZero() && credited.gt(0) ? "CANCELLED" : "PAID";
  else status = dec(inv.amountPaid).gt(0) ? "PARTIALLY_PAID" : "ISSUED";
  if (status !== inv.status) await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
  return status;
}

/** Enregistrement d'un encaissement (verrou facture, montant ≤ solde dû). */
export async function recordPayment(ctx: AuthContext, data: z.output<typeof paymentSchema>) {
  assertCan(ctx, "payments:write");
  return withRetry(async (tx) => {
    const inv = await lockInvoice(tx, ctx, data.invoiceId);
    if (inv.kind !== "INVOICE") throw new BusinessRuleError("INVALID_DOCUMENT", "Un paiement s'enregistre sur une facture");
    if (inv.status === "DRAFT") throw new BusinessRuleError("INVOICE_NOT_ISSUED", "Émettez la facture avant d'enregistrer un paiement");
    if (inv.status === "CANCELLED") throw new BusinessRuleError("INVOICE_CANCELLED", "Facture annulée par avoir");
    const credited = await creditedTotal(tx, inv.id);
    const due = dec(inv.totalInclTax).minus(credited).minus(inv.amountPaid);
    if (dec(data.amount).gt(due)) throw new BusinessRuleError("OVERPAYMENT", `Le montant dépasse le solde dû (${due.toFixed(2)} €)`);
    const payment = await tx.payment.create({
      data: { organizationId: ctx.organizationId, invoiceId: inv.id, amount: data.amount, method: data.method, paidAt: data.paidAt, reference: data.reference, notes: data.notes, recordedById: ctx.userId },
      select: { id: true },
    });
    await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: dec(inv.amountPaid).plus(data.amount).toFixed(2) } });
    const status = await refreshInvoiceStatus(tx, inv.id);
    await audit(ctx, "payment.recorded", "Invoice", inv.id, { paymentId: payment.id, amount: data.amount, method: data.method }, tx);
    return { id: payment.id, invoiceStatus: status };
  });
}

/** Avoir (brouillon) : total = copie de toutes les lignes, ou partiel avec lignes saisies. */
export async function createCreditNote(ctx: AuthContext, invoiceId: string, data: z.output<typeof creditNoteSchema>) {
  assertCan(ctx, "invoices:issue");
  const inv = await db.invoice.findFirst({ where: { id: invoiceId, organizationId: ctx.organizationId }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!inv) throw new NotFoundError("Facture");
  if (inv.kind !== "INVOICE" || inv.status === "DRAFT" || inv.status === "CANCELLED") {
    throw new BusinessRuleError("INVALID_DOCUMENT", "Un avoir se rattache à une facture émise non annulée");
  }
  const lines = data.lines?.length
    ? data.lines
    : inv.lines.map((l) => ({ kind: l.kind, productId: l.productId, description: l.description, quantity: l.quantity.toString(), days: l.days.toString(), unitPrice: l.unitPrice.toFixed(2), discountPercent: l.discountPercent.toString(), vatRate: l.vatRate.toString() }));
  const { totals, lines: built } = buildLines(lines, data.lines?.length ? "0" : inv.globalDiscountPercent.toString());
  const note = await db.invoice.create({
    data: {
      organizationId: ctx.organizationId,
      kind: "CREDIT_NOTE",
      customerId: inv.customerId,
      eventId: inv.eventId,
      creditedInvoiceId: inv.id,
      title: `Avoir sur ${inv.number}`,
      globalDiscountPercent: data.lines?.length ? "0" : inv.globalDiscountPercent,
      notes: data.reason,
      totalExclTax: totals.totalExclTax,
      totalTax: totals.totalTax,
      totalInclTax: totals.totalInclTax,
      lines: { create: built },
    },
    select: { id: true },
  });
  await audit(ctx, "credit_note.draft_created", "Invoice", note.id, { invoice: inv.number, reason: data.reason });
  return note;
}

export function balanceDue(inv: { totalInclTax: Prisma.Decimal | string; amountPaid: Prisma.Decimal | string }, credited: Prisma.Decimal | string | number = 0) {
  return dec(inv.totalInclTax).minus(inv.amountPaid).minus(credited);
}

export async function listInvoices(ctx: AuthContext, query: ListQuery & { status?: InvoiceStatus; overdue?: boolean; customerId?: string; kind?: "INVOICE" | "CREDIT_NOTE" }) {
  assertCan(ctx, "invoices:read");
  const now = new Date();
  const where: Prisma.InvoiceWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.overdue ? { kind: "INVOICE", status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } } : {}),
    ...(query.q ? { OR: [{ number: { contains: query.q, mode: "insensitive" } }, { title: { contains: query.q, mode: "insensitive" } }, { customer: { name: { contains: query.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: [{ issueDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      ...paginationArgs(query),
      select: {
        id: true, number: true, kind: true, title: true, status: true, issueDate: true, dueDate: true, totalExclTax: true, totalInclTax: true, amountPaid: true, createdAt: true,
        customer: { select: { id: true, name: true } },
        creditNotes: { where: { status: { not: "DRAFT" } }, select: { totalInclTax: true } },
      },
    }),
    db.invoice.count({ where }),
  ]);
  return paginated(
    rows.map((i) => {
      const credited = sumMoney(i.creditNotes.map((c) => c.totalInclTax));
      const due = i.kind === "INVOICE" && i.status !== "DRAFT" ? balanceDue(i, credited) : dec(0);
      return {
        id: i.id,
        number: i.number,
        kind: i.kind,
        title: i.title,
        status: i.status,
        customer: i.customer,
        issueDate: i.issueDate?.toISOString() ?? null,
        dueDate: i.dueDate?.toISOString() ?? null,
        totalExclTax: moneyOrZero(i.totalExclTax),
        totalInclTax: moneyOrZero(i.totalInclTax),
        amountPaid: moneyOrZero(i.amountPaid),
        balanceDue: due.toFixed(2),
        overdue: i.kind === "INVOICE" && due.gt(0) && Boolean(i.dueDate && i.dueDate < now),
        daysLate: i.dueDate && due.gt(0) && i.dueDate < now ? Math.floor((now.getTime() - i.dueDate.getTime()) / 86_400_000) : 0,
      };
    }),
    total,
    query,
  );
}

export async function getInvoice(ctx: AuthContext, id: string) {
  assertCan(ctx, "invoices:read");
  const i = await db.invoice.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true, number: true, kind: true, title: true, status: true, issueDate: true, dueDate: true, globalDiscountPercent: true, totalExclTax: true, totalTax: true, totalInclTax: true,
      amountPaid: true, notes: true, createdAt: true, issuedAt: true, customerId: true, eventId: true, quoteId: true, billingSnapshot: true,
      customer: { select: { id: true, name: true, email: true } },
      event: { select: { id: true, reference: true, name: true } },
      quote: { select: { id: true, number: true } },
      creditedInvoice: { select: { id: true, number: true } },
      creditNotes: { select: { id: true, number: true, status: true, totalInclTax: true } },
      lines: { orderBy: { position: "asc" }, select: { id: true, kind: true, productId: true, description: true, quantity: true, days: true, unitPrice: true, discountPercent: true, vatRate: true, totalExclTax: true } },
      payments: { orderBy: { paidAt: "asc" }, select: { id: true, amount: true, method: true, paidAt: true, reference: true } },
    },
  });
  if (!i) throw new NotFoundError("Facture");
  const totals = computeDocumentTotals(i.lines, i.globalDiscountPercent);
  const credited = sumMoney(i.creditNotes.filter((c) => c.status !== "DRAFT").map((c) => c.totalInclTax));
  const due = i.kind === "INVOICE" && i.status !== "DRAFT" ? balanceDue(i, credited) : dec(0);
  return {
    ...i,
    globalDiscountPercent: decimalString(i.globalDiscountPercent)!,
    totalExclTax: moneyOrZero(i.totalExclTax),
    totalTax: moneyOrZero(i.totalTax),
    totalInclTax: moneyOrZero(i.totalInclTax),
    amountPaid: moneyOrZero(i.amountPaid),
    creditedTotal: credited.toFixed(2),
    balanceDue: due.toFixed(2),
    issueDate: i.issueDate?.toISOString() ?? null,
    dueDate: i.dueDate?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
    issuedAt: i.issuedAt?.toISOString() ?? null,
    vat: totals.vat,
    subtotalExclTax: totals.subtotalExclTax,
    globalDiscountAmount: totals.globalDiscountAmount,
    creditNotes: i.creditNotes.map((c) => ({ ...c, totalInclTax: moneyOrZero(c.totalInclTax) })),
    lines: i.lines.map((l) => ({
      ...l,
      quantity: decimalString(l.quantity)!,
      days: decimalString(l.days)!,
      unitPrice: money(l.unitPrice)!,
      discountPercent: decimalString(l.discountPercent)!,
      vatRate: decimalString(l.vatRate)!,
      totalExclTax: money(l.totalExclTax)!,
    })),
    payments: i.payments.map((p) => ({ ...p, amount: money(p.amount)!, paidAt: p.paidAt.toISOString() })),
  };
}

// ─── Dépenses ──────────────────────────────────────────────────────────

export async function createExpense(ctx: AuthContext, data: z.output<typeof expenseSchema>) {
  assertCan(ctx, "expenses:write");
  const checks = await Promise.all([
    data.eventId ? db.event.count({ where: { id: data.eventId, organizationId: ctx.organizationId } }) : 1,
    data.vehicleId ? db.vehicle.count({ where: { id: data.vehicleId, organizationId: ctx.organizationId } }) : 1,
    data.supplierId ? db.supplier.count({ where: { id: data.supplierId, organizationId: ctx.organizationId } }) : 1,
  ]);
  if (checks.some((c) => c === 0)) throw new ValidationError("Référence inconnue (événement, véhicule ou fournisseur)");
  const e = await db.expense.create({ data: { organizationId: ctx.organizationId, ...data, createdById: ctx.userId }, select: { id: true } });
  await audit(ctx, "expense.created", "Expense", e.id, { amount: data.amountExclTax, category: data.category, eventId: data.eventId });
  return e;
}

export async function deleteExpense(ctx: AuthContext, id: string) {
  assertCan(ctx, "expenses:write");
  const e = await db.expense.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { amountExclTax: true, description: true } });
  if (!e) throw new NotFoundError("Dépense");
  await db.expense.delete({ where: { id } });
  await audit(ctx, "expense.deleted", "Expense", id, { amount: e.amountExclTax.toFixed(2), description: e.description });
}

export async function listExpenses(ctx: AuthContext, query: ListQuery & { eventId?: string; from?: Date; to?: Date }) {
  assertCan(ctx, "finance:read");
  const where: Prisma.ExpenseWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.eventId ? { eventId: query.eventId } : {}),
    ...(query.from || query.to ? { incurredAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } } : {}),
    ...(query.q ? { description: { contains: query.q, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: { incurredAt: "desc" },
      ...paginationArgs(query),
      select: { id: true, category: true, description: true, amountExclTax: true, vatRate: true, incurredAt: true, supplierInvoiceRef: true, event: { select: { id: true, reference: true } }, vehicle: { select: { id: true, registration: true } }, supplier: { select: { id: true, name: true } } },
    }),
    db.expense.count({ where }),
  ]);
  return paginated(rows.map((e) => ({ ...e, amountExclTax: money(e.amountExclTax)!, vatRate: decimalString(e.vatRate)!, incurredAt: e.incurredAt.toISOString() })), total, query);
}
