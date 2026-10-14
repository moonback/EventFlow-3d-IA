import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";
import { createCreditNote, createInvoice, createInvoiceFromQuote, getInvoice, issueInvoice, recordPayment, updateInvoiceDraft } from "@/server/services/invoice-service";
import { acceptQuote, createQuote, getQuote, issueQuote, reviseQuote, updateQuote } from "@/server/services/quote-service";
import { computeEventFinancials } from "@/server/services/finance-service";
import { createCustomer, createEvent, createOrg, createProduct, createUserInOrg, day } from "../helpers/factories";

let ctx: AuthContext;
let customerId: string;
let eventId: string;
let productId: string;

const lines = () => [
  { kind: "EQUIPMENT" as const, productId, description: "Projecteur LED", quantity: "3", days: "2", unitPrice: "19.99", discountPercent: "10", vatRate: "20" },
  { kind: "LABOR" as const, productId: null, description: "Technicien", quantity: "7.5", days: "1", unitPrice: "35.00", discountPercent: "0", vatRate: "20" },
  { kind: "SERVICE" as const, productId: null, description: "Billetterie", quantity: "1", days: "1", unitPrice: "100.00", discountPercent: "0", vatRate: "5.5" },
];

beforeAll(async () => {
  const org = await createOrg("Commercial");
  ctx = await createUserInOrg(org.id, "OWNER");
  customerId = (await createCustomer(org.id)).id;
  eventId = (await createEvent(org.id, day(5), day(6), customerId)).id;
  productId = (await createProduct(org.id)).id;
});

describe("devis", () => {
  it("calcule les totaux exacts côté serveur", async () => {
    const q = await createQuote(ctx, { customerId, eventId, title: "Soirée", validUntil: null, globalDiscountPercent: "5", notes: null, terms: null, lines: lines() });
    const quote = await getQuote(ctx, q.id);
    // 3×2×19.99×0.9 = 107.946 → 107.95 ; 7.5×35 = 262.50 ; 100.00
    expect(quote.lines.map((l) => l.totalExclTax)).toEqual(["107.95", "262.50", "100.00"]);
    expect(quote.subtotalExclTax).toBe("470.45");
    expect(quote.globalDiscountAmount).toBe("23.52"); // 470.45 × 5 % = 23.5225
    expect(quote.totalExclTax).toBe("446.93");
    // Bases par taux après remise globale : 20 % → 370.45×0.95 = 351.93 ; 5.5 % → 446.93 − 351.93 = 95.00
    expect(quote.vat).toEqual([
      { rate: "5.50", base: "95.00", tax: "5.23" },
      { rate: "20.00", base: "351.93", tax: "70.39" },
    ]);
    expect(quote.totalTax).toBe("75.62");
    expect(quote.totalInclTax).toBe("522.55");
  });

  it("n'est plus modifiable après émission ; une révision crée une nouvelle version", async () => {
    const q = await createQuote(ctx, { customerId, eventId, title: "Gala", validUntil: null, globalDiscountPercent: "0", notes: null, terms: null, lines: lines() });
    await issueQuote(ctx, q.id);
    await expect(updateQuote(ctx, q.id, { customerId, eventId, title: "Modifié", validUntil: null, globalDiscountPercent: "0", notes: null, terms: null, lines: lines() })).rejects.toMatchObject({ code: "NOT_EDITABLE" });
    const v2 = await reviseQuote(ctx, q.id);
    expect(v2.number).toMatch(/-V2$/);
    expect((await db.quote.findUniqueOrThrow({ where: { id: q.id } })).status).toBe("CANCELLED");
  });

  it("un devis accepté génère une réservation brouillon des lignes matériel", async () => {
    const q = await createQuote(ctx, { customerId, eventId, title: "Mariage", validUntil: null, globalDiscountPercent: "0", notes: null, terms: null, lines: lines() });
    await issueQuote(ctx, q.id);
    const res = await acceptQuote(ctx, q.id, { createReservation: true });
    expect(res.reservationId).toBeTruthy();
    const r = await db.reservation.findUniqueOrThrow({ where: { id: res.reservationId! }, include: { lines: true } });
    expect(r.status).toBe("DRAFT");
    expect(r.lines).toEqual([expect.objectContaining({ productId, quantity: 3 })]);
  });
});

describe("factures et paiements", () => {
  it("numérote séquentiellement à l'émission et interdit toute modification ensuite", async () => {
    const draft = await createInvoice(ctx, { customerId, eventId, title: "Acompte", globalDiscountPercent: "0", notes: null, lines: lines() });
    expect((await getInvoice(ctx, draft.id)).number).toBeNull();
    const a = await issueInvoice(ctx, draft.id);
    const b = await issueInvoice(ctx, (await createInvoice(ctx, { customerId, eventId: null, title: "Solde", globalDiscountPercent: "0", notes: null, lines: lines() })).id);
    const seq = (n: string) => Number(n.split("-").pop());
    expect(seq(b.number)).toBe(seq(a.number) + 1);
    await expect(updateInvoiceDraft(ctx, draft.id, { customerId, eventId, title: "Modif", globalDiscountPercent: "0", notes: null, lines: lines() })).rejects.toMatchObject({ code: "INVOICE_LOCKED" });
    // Même en contournant les services, la base refuse (trigger)
    await expect(db.invoice.update({ where: { id: draft.id }, data: { totalInclTax: "1.00" } })).rejects.toThrow(/immutable/);
    await expect(db.invoiceLine.updateMany({ where: { invoiceId: draft.id }, data: { unitPrice: "0.01" } })).rejects.toThrow(/immutable/);
    await expect(db.invoice.delete({ where: { id: draft.id } })).rejects.toThrow(/cannot be deleted/);
  });

  it("enregistre les paiements partiels, refuse le trop-perçu, solde à zéro", async () => {
    const inv = await createInvoice(ctx, { customerId, eventId, title: "Prestation", globalDiscountPercent: "0", notes: null, lines: [{ kind: "SERVICE", productId: null, description: "Forfait", quantity: "1", days: "1", unitPrice: "1000.00", discountPercent: "0", vatRate: "20" }] });
    await expect(recordPayment(ctx, { invoiceId: inv.id, amount: "100.00", method: "CARD", paidAt: new Date(), reference: null, notes: null })).rejects.toMatchObject({ code: "INVOICE_NOT_ISSUED" });
    await issueInvoice(ctx, inv.id);
    await recordPayment(ctx, { invoiceId: inv.id, amount: "400.10", method: "BANK_TRANSFER", paidAt: new Date(), reference: "VIR-1", notes: null });
    let i = await getInvoice(ctx, inv.id);
    expect(i.status).toBe("PARTIALLY_PAID");
    expect(i.balanceDue).toBe("799.90");
    await expect(recordPayment(ctx, { invoiceId: inv.id, amount: "799.91", method: "CARD", paidAt: new Date(), reference: null, notes: null })).rejects.toMatchObject({ code: "OVERPAYMENT" });
    await recordPayment(ctx, { invoiceId: inv.id, amount: "799.90", method: "CARD", paidAt: new Date(), reference: null, notes: null });
    i = await getInvoice(ctx, inv.id);
    expect(i.status).toBe("PAID");
    expect(i.balanceDue).toBe("0.00");
  });

  it("corrige une facture émise par un avoir", async () => {
    const inv = await createInvoice(ctx, { customerId, eventId, title: "À annuler", globalDiscountPercent: "0", notes: null, lines: [{ kind: "SERVICE", productId: null, description: "Forfait", quantity: "1", days: "1", unitPrice: "250.00", discountPercent: "0", vatRate: "20" }] });
    await issueInvoice(ctx, inv.id);
    const note = await createCreditNote(ctx, inv.id, { reason: "Annulation client" });
    const issued = await issueInvoice(ctx, note.id);
    expect(issued.number).toMatch(/^AV-/);
    const original = await getInvoice(ctx, inv.id);
    expect(original.status).toBe("CANCELLED");
    expect(original.balanceDue).toBe("0.00");
  });

  it("facture un devis accepté et alimente la rentabilité", async () => {
    const q = await createQuote(ctx, { customerId, eventId, title: "Séminaire", validUntil: null, globalDiscountPercent: "0", notes: null, terms: null, lines: lines() });
    await issueQuote(ctx, q.id);
    await acceptQuote(ctx, q.id, { createReservation: false });
    const inv = await createInvoiceFromQuote(ctx, q.id);
    await issueInvoice(ctx, inv.id);
    await expect(createInvoiceFromQuote(ctx, q.id)).rejects.toMatchObject({ code: "ALREADY_INVOICED" });
    const fin = (await computeEventFinancials(ctx.organizationId, [eventId])).get(eventId)!;
    expect(Number(fin.revenueForecast)).toBeGreaterThan(0);
    expect(Number(fin.revenueInvoiced)).toBeGreaterThan(0);
  });
});
