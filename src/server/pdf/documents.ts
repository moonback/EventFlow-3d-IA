import "server-only";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { invoiceStatusLabels, lineKindLabels, quoteStatusLabels } from "@/lib/labels";
import { orderLoading, productUnitVolume } from "@/lib/loading-plan";
import { dec } from "@/lib/money";
import { assertCan, type AuthContext } from "../auth/context";
import { getInvoice } from "../services/invoice-service";
import { getQuote } from "../services/quote-service";
import { getReservation } from "../services/reservation-service";
import { stockSummaries } from "../services/inventory-service";
import { addressBlock, createDoc, finalize, header, paragraph, PAGE, pdfDate, pdfDateTime, pdfMoney, signatureBoxes, table, toBuffer, totalsBlock, type OrgHeader } from "./base";

async function orgHeader(organizationId: string) {
  return db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, legalName: true, addressLine1: true, addressLine2: true, postalCode: true, city: true, email: true, phone: true, siret: true, vatNumber: true, accentColor: true, timezone: true, currency: true, quoteFooter: true, invoiceFooter: true, latePenaltyText: true },
  });
}

function legalFooter(org: OrgHeader & { invoiceFooter?: string | null }) {
  return [org.legalName || org.name, org.siret ? `SIRET ${org.siret}` : null, org.vatNumber ? `TVA intracom. ${org.vatNumber}` : null].filter(Boolean).join(" · ");
}

async function customerAddress(organizationId: string, customerId: string) {
  const c = await db.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { name: true, email: true, siret: true, vatNumber: true, addresses: { where: { kind: "BILLING" }, orderBy: { isDefault: "desc" }, take: 1, select: { line1: true, line2: true, postalCode: true, city: true, country: true } } },
  });
  if (!c) throw new NotFoundError("Client");
  const a = c.addresses[0];
  return [c.name, a?.line1, a?.line2, a ? `${a.postalCode} ${a.city}` : null, c.siret ? `SIRET ${c.siret}` : null, c.vatNumber ? `TVA ${c.vatNumber}` : null, c.email];
}

const lineColumns = [
  { label: "Désignation", width: 176 },
  { label: "Type", width: 58 },
  { label: "Qté", width: 34, align: "right" as const },
  { label: "Jours", width: 32, align: "right" as const },
  { label: "PU HT", width: 62, align: "right" as const },
  { label: "Rem.", width: 32, align: "right" as const },
  { label: "TVA", width: 30, align: "right" as const },
  { label: "Total HT", width: 75.28, align: "right" as const },
];

function lineRows(lines: { description: string; kind: keyof typeof lineKindLabels; quantity: string; days: string; unitPrice: string; discountPercent: string; vatRate: string; totalExclTax: string }[], currency: string) {
  return lines.map((l) => [
    l.description,
    lineKindLabels[l.kind],
    dec(l.quantity).toString(),
    dec(l.days).toString(),
    pdfMoney(l.unitPrice, currency),
    dec(l.discountPercent).isZero() ? "-" : `${dec(l.discountPercent).toString()} %`,
    `${dec(l.vatRate).toString()} %`,
    pdfMoney(l.totalExclTax, currency),
  ]);
}

export async function renderQuotePdf(ctx: AuthContext, id: string): Promise<Buffer> {
  const q = await getQuote(ctx, id);
  const org = await orgHeader(ctx.organizationId);
  const doc = createDoc(`Devis ${q.number}`);
  header(doc, org, "DEVIS", q.number, [
    ["Date", pdfDate(q.issueDate ?? q.createdAt, org.timezone)],
    ["Validité", pdfDate(q.validUntil, org.timezone)],
    ["Statut", quoteStatusLabels[q.status]],
  ]);
  const y = doc.y;
  addressBlock(doc, "Client", await customerAddress(ctx.organizationId, q.customerId), PAGE.width - PAGE.margin - 240, y, 240);
  addressBlock(doc, "Objet", [q.title, q.event ? `Événement ${q.event.reference} — ${q.event.name}` : null], PAGE.margin, y, 240);
  doc.y = y + 90;
  table(doc, lineColumns, lineRows(q.lines, org.currency));
  totalsBlock(doc, [
    ["Sous-total HT", pdfMoney(q.subtotalExclTax, org.currency)],
    ...(dec(q.globalDiscountAmount).isZero() ? [] : ([[`Remise ${q.globalDiscountPercent} %`, `- ${pdfMoney(q.globalDiscountAmount, org.currency)}`]] as [string, string][])),
    ["Total HT", pdfMoney(q.totalExclTax, org.currency)],
    ...q.vat.map((v) => [`TVA ${dec(v.rate).toString()} % (base ${pdfMoney(v.base, org.currency)})`, pdfMoney(v.tax, org.currency)] as [string, string]),
    ["Total TTC", pdfMoney(q.totalInclTax, org.currency), true],
  ]);
  paragraph(doc, "Notes", q.notes);
  paragraph(doc, "Conditions", q.terms);
  paragraph(doc, "Mentions", org.quoteFooter);
  signatureBoxes(doc, ["Bon pour accord — date, nom et signature du client", `Pour ${org.name}`]);
  finalize(doc, legalFooter(org));
  return toBuffer(doc);
}

export async function renderInvoicePdf(ctx: AuthContext, id: string): Promise<Buffer> {
  const i = await getInvoice(ctx, id);
  const org = await orgHeader(ctx.organizationId);
  const isCredit = i.kind === "CREDIT_NOTE";
  const title = isCredit ? "AVOIR" : i.status === "DRAFT" ? "FACTURE (BROUILLON)" : "FACTURE";
  const doc = createDoc(`${title} ${i.number ?? ""}`);
  header(doc, org, title, i.number ?? "Non numérotée — document non valable", [
    ["Date d'émission", pdfDate(i.issueDate, org.timezone)],
    ...(isCredit ? ([["Facture d'origine", i.creditedInvoice?.number ?? "-"]] as [string, string][]) : ([["Échéance", pdfDate(i.dueDate, org.timezone)]] as [string, string][])),
    ["Statut", invoiceStatusLabels[i.status]],
  ]);
  // Une facture émise utilise l'instantané client figé à l'émission
  const snap = i.billingSnapshot as { customer?: { name: string; email: string | null; siret: string | null; vatNumber: string | null; address: { line1: string; line2: string | null; postalCode: string; city: string } | null } } | null;
  const customerLines = snap?.customer
    ? [snap.customer.name, snap.customer.address?.line1, snap.customer.address?.line2, snap.customer.address ? `${snap.customer.address.postalCode} ${snap.customer.address.city}` : null, snap.customer.siret ? `SIRET ${snap.customer.siret}` : null, snap.customer.vatNumber ? `TVA ${snap.customer.vatNumber}` : null]
    : await customerAddress(ctx.organizationId, i.customerId);
  const y = doc.y;
  addressBlock(doc, "Facturé à", customerLines, PAGE.width - PAGE.margin - 240, y, 240);
  addressBlock(doc, "Objet", [i.title, i.event ? `Événement ${i.event.reference} — ${i.event.name}` : null, i.quote ? `Devis ${i.quote.number}` : null], PAGE.margin, y, 240);
  doc.y = y + 90;
  table(doc, lineColumns, lineRows(i.lines, org.currency));
  totalsBlock(doc, [
    ["Sous-total HT", pdfMoney(i.subtotalExclTax, org.currency)],
    ...(dec(i.globalDiscountAmount).isZero() ? [] : ([[`Remise ${i.globalDiscountPercent} %`, `- ${pdfMoney(i.globalDiscountAmount, org.currency)}`]] as [string, string][])),
    ["Total HT", pdfMoney(i.totalExclTax, org.currency)],
    ...i.vat.map((v) => [`TVA ${dec(v.rate).toString()} %`, pdfMoney(v.tax, org.currency)] as [string, string]),
    ["Total TTC", pdfMoney(i.totalInclTax, org.currency), true],
    ...(!isCredit && i.status !== "DRAFT"
      ? ([
          ["Déjà réglé", pdfMoney(i.amountPaid, org.currency)],
          ...(dec(i.creditedTotal).isZero() ? [] : ([["Avoirs", `- ${pdfMoney(i.creditedTotal, org.currency)}`]] as [string, string][])),
          ["Reste à payer", pdfMoney(i.balanceDue, org.currency), true],
        ] as [string, string, boolean?][])
      : []),
  ]);
  paragraph(doc, "Notes", i.notes);
  if (!isCredit) paragraph(doc, "Conditions de paiement", org.latePenaltyText);
  paragraph(doc, "Mentions", org.invoiceFooter);
  finalize(doc, legalFooter(org));
  return toBuffer(doc);
}

type LogisticsSheet = "picking" | "delivery" | "return";

/** Bon de préparation, bon de livraison et fiche de retour d'une réservation. */
export async function renderReservationSheet(ctx: AuthContext, id: string, sheet: LogisticsSheet): Promise<Buffer> {
  const r = await getReservation(ctx, id);
  const org = await orgHeader(ctx.organizationId);
  const tz = r.event.timezone;
  const titles: Record<LogisticsSheet, string> = { picking: "BON DE PRÉPARATION", delivery: "BON DE LIVRAISON", return: "FICHE DE RETOUR" };
  const doc = createDoc(`${titles[sheet]} ${r.reference}`);
  header(doc, org, titles[sheet], r.reference, [
    ["Événement", r.event.reference],
    ["Début", pdfDateTime(r.startAt, tz)],
    ["Fin", pdfDateTime(r.endAt, tz)],
  ]);
  const y = doc.y;
  addressBlock(doc, "Événement", [r.event.name, r.event.customer.name, [r.event.venueName, r.event.city].filter(Boolean).join(", ")], PAGE.margin, y, 240);
  addressBlock(doc, "Édité le", [pdfDateTime(new Date(), tz), `Par ${ctx.user.name}`], PAGE.width - PAGE.margin - 240, y, 240);
  doc.y = y + 90;
  if (sheet === "picking") {
    table(
      doc,
      [
        { label: "Réf.", width: 65 },
        { label: "Désignation", width: 160 },
        { label: "Emplacements", width: 105 },
        { label: "Demandé", width: 45, align: "right" },
        { label: "Préparé", width: 45, align: "right" },
        { label: "Manquant", width: 45, align: "right" },
        { label: "OK", width: 34.28, align: "center" },
      ],
      r.lines.map((l) => [
        l.product.sku,
        l.product.name,
        l.product.balances.map((b) => `${b.location.code} (${b.quantity})`).join(", ") || "-",
        String(l.quantity),
        String(l.quantityPrepared),
        String(Math.max(0, l.quantity - l.quantityPrepared)),
        "[  ]",
      ]),
    );
    signatureBoxes(doc, ["Préparé par", "Contrôlé par"]);
  } else if (sheet === "delivery") {
    const totalWeight = r.lines.reduce((acc, l) => acc.plus(dec(l.product.weightKg ?? 0).mul(l.quantityShipped || l.quantityPrepared)), dec(0));
    table(
      doc,
      [
        { label: "Réf.", width: 80 },
        { label: "Désignation", width: 220 },
        { label: "Unité", width: 60 },
        { label: "Quantité", width: 70, align: "right" },
        { label: "Chargé", width: 69.28, align: "center" },
      ],
      r.lines.map((l) => [l.product.sku, l.product.name, l.product.unit, String(l.quantityShipped || l.quantityPrepared), "[  ]"]),
    );
    paragraph(doc, "Poids estimé", `${totalWeight.toFixed(1)} kg (selon fiches produits)`);
    // Ordre de chargement : dernier chargé, premier déchargé (structures et énergie près des portes)
    const plan = orderLoading(
      r.lines.map((l) => ({ sku: l.product.sku, name: l.product.name, category: l.product.category?.name ?? null, quantity: l.quantityShipped || l.quantityPrepared || l.quantity, unitVolume: productUnitVolume(l.product), unitWeight: l.product.weightKg === null ? null : Number(l.product.weightKg) })),
    );
    if (plan.length) {
      paragraph(doc, "Ordre de chargement", "Étape 1 = chargée en premier, au fond de la caisse. Le matériel installé en premier sur le site est chargé en dernier, près des portes.");
      table(
        doc,
        [
          { label: "#", width: 30, align: "right" },
          { label: "Réf.", width: 75 },
          { label: "Désignation", width: 175 },
          { label: "Qté", width: 40, align: "right" },
          { label: "Volume", width: 60, align: "right" },
          { label: "Emplacement", width: 119.28 },
        ],
        plan.map((s) => [String(s.step), s.sku, s.name, String(s.quantity), s.volume === null ? "—" : `${s.volume.toFixed(2)} m³`, s.zone]),
      );
    }
    signatureBoxes(doc, ["Chargement — chauffeur", "Livraison — réception client (date, nom, signature)"]);
  } else {
    table(
      doc,
      [
        { label: "Réf.", width: 70 },
        { label: "Désignation", width: 170 },
        { label: "Sorti", width: 45, align: "right" },
        { label: "Retourné", width: 55, align: "right" },
        { label: "Endomm.", width: 50, align: "right" },
        { label: "Perdu", width: 45, align: "right" },
        { label: "Reste dû", width: 64.28, align: "right" },
      ],
      r.lines.map((l) => [l.product.sku, l.product.name, String(l.quantityShipped), String(l.quantityReturned), String(l.quantityDamaged), String(l.quantityLost), String(l.outstanding)]),
    );
    for (const insp of r.inspections) {
      const anomalies = insp.lines.filter((l) => l.anomaly || l.quantityMissing > 0 || l.quantityDamaged > 0);
      if (anomalies.length) {
        paragraph(doc, `Contrôle du ${pdfDateTime(insp.createdAt, tz)}`, anomalies.map((a) => `${a.product.name} : bon ${a.quantityGood}, endommagé ${a.quantityDamaged}, manquant ${a.quantityMissing}${a.anomaly ? ` — ${a.anomaly}` : ""}`).join("\n"));
      }
    }
    signatureBoxes(doc, ["Retour réceptionné par", "Contrôle qualité"]);
  }
  paragraph(doc, "Notes", r.notes);
  finalize(doc, legalFooter(org));
  return toBuffer(doc);
}

export async function renderStockReportPdf(ctx: AuthContext): Promise<Buffer> {
  assertCan(ctx, "stock:read");
  const org = await orgHeader(ctx.organizationId);
  const products = await db.equipmentProduct.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null, stockManaged: true },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    select: { id: true, sku: true, name: true, alertThreshold: true, category: { select: { name: true } } },
  });
  const summaries = await stockSummaries(ctx.organizationId, products.map((p) => p.id));
  const doc = createDoc("Rapport de stock");
  header(doc, org, "RAPPORT DE STOCK", null, [["Édité le", pdfDateTime(new Date(), org.timezone)], ["Références", String(products.length)]]);
  table(
    doc,
    [
      { label: "SKU", width: 70 },
      { label: "Produit", width: 150 },
      { label: "Total", width: 40, align: "right" },
      { label: "Rayon", width: 40, align: "right" },
      { label: "Prépa", width: 40, align: "right" },
      { label: "Sorti", width: 40, align: "right" },
      { label: "Endom.", width: 40, align: "right" },
      { label: "Maint.", width: 40, align: "right" },
      { label: "Dispo", width: 39.28, align: "right" },
    ],
    products.map((p) => {
      const s = summaries.get(p.id)!;
      const flag = p.alertThreshold > 0 && s.availableNow <= p.alertThreshold ? " (!)" : "";
      return [p.sku, `${p.name}${flag}`, String(s.total), String(s.inStorage), String(s.inPreparation), String(s.inTransit), String(s.damaged), String(s.inMaintenance), String(s.availableNow)];
    }),
    { fontSize: 8 },
  );
  paragraph(doc, "Légende", "(!) : disponibilité inférieure ou égale au seuil d'alerte. « Dispo » = disponible sur l'heure qui vient, réservations confirmées déduites.");
  finalize(doc, legalFooter(org));
  return toBuffer(doc);
}
