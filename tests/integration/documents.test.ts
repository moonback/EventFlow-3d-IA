import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { AuthContext } from "@/server/auth/context";
import { renderInvoicePdf, renderQuotePdf } from "@/server/pdf/documents";
import { listDocuments, readDocument, uploadDocument } from "@/server/services/document-service";
import { createQuote } from "@/server/services/quote-service";
import { createCustomer, createOrg, createUserInOrg } from "../helpers/factories";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

let adminA: AuthContext;
let adminB: AuthContext;
let driverA: AuthContext;
let crewA: AuthContext;
let customerId: string;
let documentId: string;
let quoteId: string;

beforeAll(async () => {
  const orgA = await createOrg("DocsA");
  const orgB = await createOrg("DocsB");
  adminA = await createUserInOrg(orgA.id, "ADMIN");
  adminB = await createUserInOrg(orgB.id, "ADMIN");
  driverA = await createUserInOrg(orgA.id, "DRIVER");
  crewA = await createUserInOrg(orgA.id, "CREW");
  customerId = (await createCustomer(orgA.id)).id;
  documentId = (
    await uploadDocument(adminA, {
      target: "customer",
      targetId: customerId,
      fileName: "contrat signé.pdf",
      data: PDF,
      category: "CONTRACT",
    })
  ).id;
  quoteId = (
    await createQuote(adminA, {
      customerId,
      eventId: null,
      title: "Devis confidentiel",
      validUntil: null,
      globalDiscountPercent: "0",
      notes: null,
      terms: null,
      lines: [
        {
          kind: "SERVICE",
          productId: null,
          description: "Prestation",
          quantity: "1",
          days: "1",
          unitPrice: "100.00",
          discountPercent: "0",
          vatRate: "20",
        },
      ],
    })
  ).id;
});

describe("documents téléversés", () => {
  it("sont rangés sous le préfixe de l'organisation et lisibles par elle", async () => {
    const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.storageKey.startsWith(`${adminA.organizationId}/`)).toBe(true);
    expect(doc.fileName).not.toContain("/");
    const file = await readDocument(adminA, documentId);
    expect(file.mimeType).toBe("application/pdf");
    expect(Buffer.compare(file.data, PDF)).toBe(0);
  });

  it("sont invisibles depuis une autre organisation", async () => {
    await expect(readDocument(adminB, documentId)).rejects.toBeInstanceOf(NotFoundError);
    const list = await listDocuments(adminB);
    expect(JSON.stringify(list)).not.toContain(documentId);
  });

  it("exigent la permission sur l'entité de rattachement", async () => {
    // Pas de documents:read
    await expect(readDocument(crewA, documentId)).rejects.toBeInstanceOf(ForbiddenError);
    // documents:read mais pas customers:read : document client refusé et absent de la liste
    await expect(readDocument(driverA, documentId)).rejects.toBeInstanceOf(ForbiddenError);
    expect(JSON.stringify(await listDocuments(driverA))).not.toContain(documentId);
  });

  it("refusent un fichier dont le contenu ne correspond pas à l'extension", async () => {
    const exe = Buffer.from("MZ\x90\x00\x03\x00\x00\x00binaire");
    await expect(
      uploadDocument(adminA, {
        target: "customer",
        targetId: customerId,
        fileName: "facture.pdf",
        data: exe,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("ne peuvent pas être rattachés à une entité d'une autre organisation", async () => {
    await expect(
      uploadDocument(adminB, { target: "customer", targetId: customerId, fileName: "x.pdf", data: PDF }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("PDF générés", () => {
  it("sont produits pour l'organisation propriétaire", async () => {
    const pdf = await renderQuotePdf(adminA, quoteId);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("sont refusés hors organisation ou sans permission", async () => {
    await expect(renderQuotePdf(adminB, quoteId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(renderQuotePdf(crewA, quoteId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(renderInvoicePdf(adminB, quoteId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
