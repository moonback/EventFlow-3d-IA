import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { DocumentCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Permission } from "@/lib/permissions";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { storage } from "../storage";

export type DocumentTarget = "customer" | "event" | "vehicle" | "staff" | "product-photo";

const TARGET_PERMISSIONS: Record<DocumentTarget, { read: Permission; write: Permission }> = {
  customer: { read: "customers:read", write: "customers:write" },
  event: { read: "events:read", write: "events:write" },
  vehicle: { read: "vehicles:read", write: "vehicles:write" },
  staff: { read: "staff:read", write: "staff:write" },
  "product-photo": { read: "inventory:read", write: "inventory:write" },
};

/** Types autorisés, vérifiés par signature binaire (le type annoncé par le navigateur n'est pas fiable). */
const ALLOWED: { mime: string; ext: string[]; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: ["pdf"], test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/png", ext: ["png"], test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: ["jpg", "jpeg"], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: ["webp"], test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ["docx"], test: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
  { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ["xlsx"], test: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
  { mime: "text/csv", ext: ["csv"], test: (b) => !b.subarray(0, 4096).includes(0) },
  { mime: "text/plain", ext: ["txt"], test: (b) => !b.subarray(0, 4096).includes(0) },
];
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function detectFileType(fileName: string, data: Buffer) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const match = ALLOWED.find((a) => a.ext.includes(ext));
  if (!match || !match.test(data)) return null;
  return match.mime;
}

export function sanitizeFileName(name: string) {
  const base = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim();
  return (base || "fichier").slice(-120);
}

async function assertTarget(ctx: AuthContext, target: DocumentTarget, targetId: string) {
  const where = { id: targetId, organizationId: ctx.organizationId };
  const found =
    target === "customer" ? await db.customer.count({ where })
    : target === "event" ? await db.event.count({ where })
    : target === "vehicle" ? await db.vehicle.count({ where })
    : target === "staff" ? await db.staffMember.count({ where })
    : await db.equipmentProduct.count({ where });
  if (!found) throw new NotFoundError("Élément cible");
}

export async function uploadDocument(
  ctx: AuthContext,
  input: { target: DocumentTarget; targetId: string; fileName: string; data: Buffer; category?: DocumentCategory },
) {
  assertCan(ctx, "documents:write", TARGET_PERMISSIONS[input.target].write);
  const maxBytes = env().UPLOAD_MAX_MB * 1024 * 1024;
  if (input.data.length === 0) throw new ValidationError("Fichier vide");
  if (input.data.length > maxBytes) throw new ValidationError(`Fichier trop volumineux (max ${env().UPLOAD_MAX_MB} Mo)`);
  const mimeType = detectFileType(input.fileName, input.data);
  if (!mimeType) throw new ValidationError("Type de fichier non autorisé (PDF, PNG, JPEG, WEBP, DOCX, XLSX, CSV, TXT)");
  if (input.target === "product-photo" && !IMAGE_MIMES.has(mimeType)) throw new ValidationError("La photo doit être une image (PNG, JPEG, WEBP)");
  await assertTarget(ctx, input.target, input.targetId);

  const fileName = sanitizeFileName(input.fileName);
  const storageKey = `${ctx.organizationId}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
  await storage().put(storageKey, input.data, mimeType);
  try {
    const doc = await db.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          organizationId: ctx.organizationId,
          category: input.target === "product-photo" ? "PHOTO" : (input.category ?? "OTHER"),
          fileName,
          mimeType,
          sizeBytes: input.data.length,
          storageKey,
          sha256: createHash("sha256").update(input.data).digest("hex"),
          uploadedById: ctx.userId,
          customerId: input.target === "customer" ? input.targetId : null,
          eventId: input.target === "event" ? input.targetId : null,
          vehicleId: input.target === "vehicle" ? input.targetId : null,
          staffId: input.target === "staff" ? input.targetId : null,
        },
        select: { id: true, fileName: true },
      });
      if (input.target === "product-photo") {
        await tx.equipmentProduct.update({ where: { id: input.targetId }, data: { photoDocumentId: created.id } });
      }
      return created;
    });
    await audit(ctx, "document.uploaded", "Document", doc.id, { target: input.target, targetId: input.targetId, fileName, sizeBytes: input.data.length });
    return doc;
  } catch (error) {
    await storage().delete(storageKey).catch(() => undefined);
    throw error;
  }
}

/** Téléchargement : contrôle organisation + permission sur l'entité de rattachement. */
export async function readDocument(ctx: AuthContext, id: string) {
  assertCan(ctx, "documents:read");
  const doc = await db.document.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, fileName: true, mimeType: true, storageKey: true, customerId: true, eventId: true, vehicleId: true, staffId: true, productPhotoOf: { select: { id: true } } },
  });
  if (!doc) throw new NotFoundError("Document");
  const required: Permission[] = [];
  if (doc.customerId) required.push("customers:read");
  if (doc.eventId) required.push("events:read");
  if (doc.vehicleId) required.push("vehicles:read");
  if (doc.staffId) required.push("staff:read");
  if (doc.productPhotoOf) required.push("inventory:read");
  assertCan(ctx, ...required);
  const data = await storage().get(doc.storageKey);
  return { fileName: doc.fileName, mimeType: doc.mimeType, data };
}

/** Lecture d'une photo produit (autorisée avec inventory:read, sans documents:read). */
export async function readProductPhoto(ctx: AuthContext, productId: string) {
  assertCan(ctx, "inventory:read");
  const p = await db.equipmentProduct.findFirst({ where: { id: productId, organizationId: ctx.organizationId }, select: { photo: { select: { fileName: true, mimeType: true, storageKey: true } } } });
  if (!p?.photo) throw new NotFoundError("Photo");
  return { fileName: p.photo.fileName, mimeType: p.photo.mimeType, data: await storage().get(p.photo.storageKey) };
}

export async function deleteDocument(ctx: AuthContext, id: string) {
  assertCan(ctx, "documents:write");
  const doc = await db.document.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, storageKey: true, fileName: true, customerId: true, eventId: true, vehicleId: true, staffId: true } });
  if (!doc) throw new NotFoundError("Document");
  const required: Permission[] = [];
  if (doc.customerId) required.push("customers:write");
  if (doc.eventId) required.push("events:write");
  if (doc.vehicleId) required.push("vehicles:write");
  if (doc.staffId) required.push("staff:write");
  assertCan(ctx, ...required);
  await db.document.delete({ where: { id } });
  await storage().delete(doc.storageKey).catch(() => undefined);
  await audit(ctx, "document.deleted", "Document", id, { fileName: doc.fileName });
}

export async function listDocuments(ctx: AuthContext, opts: { q?: string; take?: number } = {}) {
  assertCan(ctx, "documents:read");
  // Seuls les documents dont l'entité est lisible sont listés
  const or: object[] = [];
  if (ctx.permissions.has("customers:read")) or.push({ customerId: { not: null } });
  if (ctx.permissions.has("events:read")) or.push({ eventId: { not: null } });
  if (ctx.permissions.has("vehicles:read")) or.push({ vehicleId: { not: null } });
  if (ctx.permissions.has("staff:read")) or.push({ staffId: { not: null } });
  if (or.length === 0) return [];
  const rows = await db.document.findMany({
    where: { organizationId: ctx.organizationId, OR: or, ...(opts.q ? { fileName: { contains: opts.q, mode: "insensitive" } } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
    select: {
      id: true, fileName: true, category: true, mimeType: true, sizeBytes: true, createdAt: true,
      customer: { select: { id: true, name: true } }, event: { select: { id: true, reference: true, name: true } }, vehicle: { select: { id: true, registration: true } }, staff: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
