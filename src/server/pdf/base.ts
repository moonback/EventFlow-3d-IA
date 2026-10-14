import "server-only";
import PDFDocument from "pdfkit";

/**
 * Socle de mise en page PDF (A4, polices standard Helvetica — encodage WinAnsi).
 * Les espaces insécables typographiques sont normalisés pour rester lisibles.
 */
export type Doc = InstanceType<typeof PDFDocument>;

export const PAGE = { margin: 48, width: 595.28, height: 841.89 };
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

export function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/[  ]/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...");
}

export function pdfMoney(value: string | null | undefined, currency = "EUR") {
  if (value === null || value === undefined) return "-";
  return clean(new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(value as unknown as number));
}

export function pdfDate(date: Date | string | null | undefined, timezone = "Europe/Paris") {
  if (!date) return "-";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, dateStyle: "long" }).format(new Date(date));
}

export function pdfDateTime(date: Date | string | null | undefined, timezone = "Europe/Paris") {
  if (!date) return "-";
  return clean(new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(date)));
}

export interface OrgHeader {
  name: string;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2?: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  siret: string | null;
  vatNumber: string | null;
  accentColor: string;
}

export function createDoc(title: string): Doc {
  return new PDFDocument({ size: "A4", margin: PAGE.margin, bufferPages: true, info: { Title: clean(title), Producer: "EventFlow 3D", Creator: "EventFlow 3D" } });
}

export function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/** En-tête : émetteur à gauche, titre + numéro à droite. */
export function header(doc: Doc, org: OrgHeader, title: string, number: string | null, meta: [string, string][]) {
  const top = PAGE.margin;
  doc.rect(PAGE.margin, top, 6, 54).fill(org.accentColor || "#6366f1");
  doc.x = PAGE.margin;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(15).text(clean(org.legalName || org.name), PAGE.margin + 14, top, { width: 260 });
  const nameBottom = doc.y + 4;
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  const lines = [
    org.addressLine1,
    org.addressLine2,
    [org.postalCode, org.city].filter(Boolean).join(" "),
    [org.phone, org.email].filter(Boolean).join(" · "),
    org.siret ? `SIRET ${org.siret}` : null,
    org.vatNumber ? `TVA ${org.vatNumber}` : null,
  ].filter(Boolean) as string[];
  doc.text(clean(lines.join("\n")), PAGE.margin + 14, nameBottom, { width: 260 });
  const leftBottom = doc.y;

  const rightX = PAGE.width - PAGE.margin - 220;
  doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(clean(title), rightX, top, { width: 220, align: "right" });
  if (number) doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(clean(number), rightX, top + 24, { width: 220, align: "right" });
  let y = top + 42;
  doc.fontSize(8.5);
  for (const [k, v] of meta) {
    doc.fillColor(MUTED).text(clean(k), rightX, y, { width: 100, align: "right", continued: false });
    doc.fillColor(INK).text(clean(v), rightX + 104, y, { width: 116, align: "right" });
    y += 12;
  }
  doc.y = Math.max(y, leftBottom, top + 100) + 8;
}

/** Bloc d'adresse (client, lieu, etc.). */
export function addressBlock(doc: Doc, label: string, lines: (string | null | undefined)[], x: number, y: number, width = 230) {
  doc.roundedRect(x, y, width, 74, 6).strokeColor(LINE).lineWidth(0.8).stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(clean(label.toUpperCase()), x + 10, y + 8, { width: width - 20 });
  doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(clean(lines.filter(Boolean).join("\n")), x + 10, y + 21, { width: width - 20, height: 50, ellipsis: true });
}

export interface Column {
  label: string;
  width: number;
  align?: "left" | "right" | "center";
}

/** Tableau paginé avec en-tête répété. */
export function table(doc: Doc, columns: Column[], rows: string[][], opts: { zebra?: boolean; fontSize?: number } = {}) {
  const x0 = PAGE.margin;
  const fontSize = opts.fontSize ?? 8.5;
  const drawHeader = () => {
    const y = doc.y;
    doc.rect(x0, y, PAGE.width - 2 * PAGE.margin, 18).fill("#f3f4f6");
    let x = x0;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    for (const c of columns) {
      doc.text(clean(c.label.toUpperCase()), x + 4, y + 5, { width: c.width - 8, align: c.align ?? "left" });
      x += c.width;
    }
    doc.y = y + 20;
  };
  drawHeader();
  rows.forEach((row, i) => {
    doc.font("Helvetica").fontSize(fontSize);
    const heights = row.map((cell, j) => doc.heightOfString(clean(cell), { width: columns[j]!.width - 8 }));
    const h = Math.max(...heights, fontSize + 2) + 8;
    if (doc.y + h > PAGE.height - PAGE.margin - 40) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (opts.zebra !== false && i % 2 === 1) doc.rect(x0, y, PAGE.width - 2 * PAGE.margin, h).fill("#fafafa");
    let x = x0;
    doc.fillColor(INK).font("Helvetica").fontSize(fontSize);
    row.forEach((cell, j) => {
      doc.text(clean(cell), x + 4, y + 4, { width: columns[j]!.width - 8, align: columns[j]!.align ?? "left" });
      x += columns[j]!.width;
    });
    doc.moveTo(x0, y + h).lineTo(PAGE.width - PAGE.margin, y + h).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.y = y + h;
  });
  doc.moveDown(0.5);
}

/** Récapitulatif des totaux aligné à droite. */
export function totalsBlock(doc: Doc, rows: [string, string, boolean?][]) {
  const width = 240;
  const x = PAGE.width - PAGE.margin - width;
  if (doc.y + rows.length * 16 + 20 > PAGE.height - PAGE.margin - 40) doc.addPage();
  let y = doc.y + 6;
  for (const [label, value, strong] of rows) {
    if (strong) {
      doc.rect(x, y - 3, width, 20).fill("#111827");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
    } else {
      doc.fillColor(INK).font("Helvetica").fontSize(9);
    }
    doc.text(clean(label), x + 8, y + 1, { width: 130 });
    doc.text(clean(value), x + 130, y + 1, { width: width - 138, align: "right" });
    y += strong ? 22 : 15;
  }
  doc.fillColor(INK);
  doc.y = y + 6;
}

export function paragraph(doc: Doc, title: string, text: string | null | undefined) {
  if (!text) return;
  if (doc.y > PAGE.height - PAGE.margin - 80) doc.addPage();
  doc.x = PAGE.margin;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(clean(title), PAGE.margin, doc.y, { width: PAGE.width - 2 * PAGE.margin });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(clean(text), { width: PAGE.width - 2 * PAGE.margin });
  doc.moveDown(0.6);
}

export function signatureBoxes(doc: Doc, labels: string[]) {
  if (doc.y > PAGE.height - PAGE.margin - 110) doc.addPage();
  const y = doc.y + 10;
  const w = (PAGE.width - 2 * PAGE.margin - (labels.length - 1) * 16) / labels.length;
  labels.forEach((l, i) => {
    const x = PAGE.margin + i * (w + 16);
    doc.roundedRect(x, y, w, 70, 6).strokeColor(LINE).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(clean(l), x + 8, y + 8, { width: w - 16 });
  });
  doc.y = y + 80;
}

/** Pied de page sur toutes les pages : mentions + pagination. */
export function finalize(doc: Doc, footer: string | null) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Écriture dans la marge basse : neutralise le saut de page automatique de pdfkit
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = PAGE.height - PAGE.margin + 6;
    doc.moveTo(PAGE.margin, y - 6).lineTo(PAGE.width - PAGE.margin, y - 6).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(MUTED);
    if (footer) doc.text(clean(footer), PAGE.margin, y, { width: PAGE.width - 2 * PAGE.margin - 60, height: 24, ellipsis: true, lineBreak: true });
    doc.text(`${i + 1} / ${range.count}`, PAGE.width - PAGE.margin - 50, y, { width: 50, align: "right" });
    doc.page.margins.bottom = bottom;
  }
}
