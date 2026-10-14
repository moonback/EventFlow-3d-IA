import "server-only";
import type { Prisma } from "@prisma/client";
import Papa from "papaparse";
import { z } from "zod";
import { db } from "@/lib/db";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { customerSchema } from "@/features/customers/schemas";
import { productSchema } from "@/features/inventory/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { toCsv } from "./report-service";

export const IMPORT_KINDS = ["products", "customers"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

const MAX_ROWS = 2000;
const truthy = (v: string | undefined) => ["1", "true", "oui", "yes", "o", "x"].includes((v ?? "").trim().toLowerCase());

export const IMPORT_TEMPLATES: Record<ImportKind, string[]> = {
  products: ["sku", "name", "category_code", "unit", "stock_managed", "alert_threshold", "rental_price", "purchase_price", "replacement_value", "weight_kg", "volume_m3", "barcode", "description"],
  customers: ["kind", "name", "first_name", "last_name", "email", "phone", "siret", "vat_number", "notes"],
};

interface RowResult {
  line: number;
  action: "create" | "update" | "error";
  key: string;
  errors: string[];
  data: Record<string, unknown> | null;
}

function parseCsv(text: string) {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  if (parsed.errors.length && parsed.data.length === 0) throw new ValidationError(`CSV illisible : ${parsed.errors[0]?.message}`);
  if (parsed.data.length > MAX_ROWS) throw new ValidationError(`Import limité à ${MAX_ROWS} lignes`);
  return parsed.data;
}

/** Étape 1 : analyse et validation, sans aucune modification des données métier. */
export async function previewImport(ctx: AuthContext, kind: ImportKind, fileName: string, text: string) {
  assertCan(ctx, "import:run", kind === "products" ? "inventory:write" : "customers:write");
  const rows = parseCsv(text);
  const results: RowResult[] = [];

  if (kind === "products") {
    const [categories, existing] = await Promise.all([
      db.equipmentCategory.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, code: true } }),
      db.equipmentProduct.findMany({ where: { organizationId: ctx.organizationId }, select: { sku: true } }),
    ]);
    const existingSkus = new Set(existing.map((p) => p.sku));
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const category = categories.find((c) => c.code === (r.category_code ?? "").trim().toUpperCase());
      const parsed = productSchema.safeParse({
        sku: r.sku,
        name: r.name,
        categoryId: category?.id ?? "",
        unit: r.unit || "unité",
        stockManaged: r.stock_managed === undefined || r.stock_managed === "" ? true : truthy(r.stock_managed),
        alertThreshold: r.alert_threshold || 0,
        rentalPrice: r.rental_price,
        purchasePrice: r.purchase_price,
        replacementValue: r.replacement_value,
        weightKg: r.weight_kg,
        volumeM3: r.volume_m3,
        barcode: r.barcode,
        description: r.description,
      });
      const errors: string[] = [];
      if (!category) errors.push(`Catégorie inconnue : « ${r.category_code ?? ""} »`);
      if (!parsed.success) errors.push(...parsed.error.issues.filter((iss) => iss.path[0] !== "categoryId").map((iss) => `${String(iss.path[0] ?? "")} : ${iss.message}`));
      const sku = parsed.success ? parsed.data.sku : (r.sku ?? "").trim().toUpperCase();
      if (sku && seen.has(sku)) errors.push("SKU en double dans le fichier");
      seen.add(sku);
      results.push({
        line: i + 2,
        key: sku || `ligne ${i + 2}`,
        action: errors.length ? "error" : existingSkus.has(sku) ? "update" : "create",
        errors,
        data: errors.length || !parsed.success ? null : (parsed.data as Record<string, unknown>),
      });
    });
  } else {
    const existing = await db.customer.findMany({ where: { organizationId: ctx.organizationId, email: { not: null } }, select: { email: true } });
    const emails = new Set(existing.map((c) => c.email!));
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const kindRaw = (r.kind ?? "").trim().toUpperCase();
      const parsed = customerSchema.safeParse({
        kind: ["PARTICULIER", "INDIVIDUAL", "P"].includes(kindRaw) ? "INDIVIDUAL" : "COMPANY",
        name: r.name,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        phone: r.phone,
        siret: r.siret,
        vatNumber: r.vat_number,
        notes: r.notes,
      });
      const errors = parsed.success ? [] : parsed.error.issues.map((iss) => `${String(iss.path[0] ?? "")} : ${iss.message}`);
      const email = parsed.success ? parsed.data.email : null;
      if (email && seen.has(email)) errors.push("E-mail en double dans le fichier");
      if (email) seen.add(email);
      results.push({
        line: i + 2,
        key: email ?? (r.name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || `ligne ${i + 2}`),
        action: errors.length ? "error" : email && emails.has(email) ? "update" : "create",
        errors,
        data: errors.length || !parsed.success ? null : (parsed.data as Record<string, unknown>),
      });
    });
  }

  const job = await db.importJob.create({
    data: {
      organizationId: ctx.organizationId,
      kind,
      fileName: fileName.slice(0, 200),
      status: "PREVIEWED",
      rowCount: results.length,
      errorCount: results.filter((r) => r.action === "error").length,
      payload: results.filter((r) => r.data).map((r) => ({ action: r.action, data: r.data })) as Prisma.InputJsonValue,
      errors: results.filter((r) => r.errors.length).map((r) => ({ line: r.line, key: r.key, errors: r.errors })) as Prisma.InputJsonValue,
      createdById: ctx.userId,
    },
    select: { id: true },
  });
  return {
    jobId: job.id,
    rowCount: results.length,
    toCreate: results.filter((r) => r.action === "create").length,
    toUpdate: results.filter((r) => r.action === "update").length,
    errorCount: results.filter((r) => r.action === "error").length,
    rows: results.slice(0, 500).map(({ data: _d, ...r }) => r),
  };
}

const payloadSchema = z.array(z.object({ action: z.enum(["create", "update"]), data: z.record(z.string(), z.unknown()) }));

/** Étape 2 : application après confirmation explicite (transaction unique, tout ou rien). */
export async function applyImport(ctx: AuthContext, jobId: string) {
  const job = await db.importJob.findFirst({ where: { id: jobId, organizationId: ctx.organizationId } });
  if (!job) throw new NotFoundError("Import");
  assertCan(ctx, "import:run", job.kind === "products" ? "inventory:write" : "customers:write");
  if (job.status !== "PREVIEWED") throw new BusinessRuleError("IMPORT_DONE", "Cet import a déjà été traité");
  if (job.createdById !== ctx.userId) throw new BusinessRuleError("IMPORT_OWNER", "Seul l'auteur de l'aperçu peut confirmer l'import");
  if (Date.now() - job.createdAt.getTime() > 60 * 60_000) throw new BusinessRuleError("IMPORT_EXPIRED", "Aperçu expiré : recommencez l'import");
  const items = payloadSchema.parse(job.payload);
  let created = 0;
  let updated = 0;
  await db.$transaction(
    async (tx) => {
      for (const item of items) {
        if (job.kind === "products") {
          const data = productSchema.parse(item.data);
          const category = await tx.equipmentCategory.findFirst({ where: { id: data.categoryId, organizationId: ctx.organizationId }, select: { id: true } });
          if (!category) throw new ValidationError(`Catégorie supprimée depuis l'aperçu (${data.sku})`);
          const existing = await tx.equipmentProduct.findUnique({ where: { organizationId_sku: { organizationId: ctx.organizationId, sku: data.sku } }, select: { id: true } });
          if (existing) {
            await tx.equipmentProduct.update({ where: { id: existing.id }, data });
            updated++;
          } else {
            await tx.equipmentProduct.create({ data: { organizationId: ctx.organizationId, ...data } });
            created++;
          }
        } else {
          const data = customerSchema.parse(item.data);
          const name = data.kind === "COMPANY" ? data.name! : `${data.firstName} ${data.lastName}`;
          const existing = data.email ? await tx.customer.findFirst({ where: { organizationId: ctx.organizationId, email: data.email }, select: { id: true } }) : null;
          if (existing) {
            await tx.customer.update({ where: { id: existing.id }, data: { ...data, name } });
            updated++;
          } else {
            await tx.customer.create({ data: { organizationId: ctx.organizationId, ...data, name } });
            created++;
          }
        }
      }
      await tx.importJob.update({ where: { id: job.id }, data: { status: "APPLIED", appliedAt: new Date(), createdCount: created, updatedCount: updated } });
    },
    { timeout: 60_000 },
  );
  await audit(ctx, "import.applied", "ImportJob", job.id, { kind: job.kind, created, updated });
  return { created, updated };
}

export function importTemplateCsv(kind: ImportKind) {
  const cols = IMPORT_TEMPLATES[kind].map((k) => ({ key: k, label: k }));
  const example =
    kind === "products"
      ? [{ sku: "LUM-PAR64", name: "Projecteur PAR LED 64", category_code: "LIGHT", unit: "unité", stock_managed: "oui", alert_threshold: "4", rental_price: "18.00", purchase_price: "120.00", replacement_value: "150.00", weight_kg: "3.2", volume_m3: "0.02", barcode: "", description: "" }]
      : [{ kind: "entreprise", name: "Exemple SAS", first_name: "", last_name: "", email: "contact@exemple.fr", phone: "+33 1 23 45 67 89", siret: "", vat_number: "", notes: "" }];
  return toCsv(cols, example);
}

/** Exports CSV bruts (filtrés par organisation et permissions). */
export async function exportDataset(ctx: AuthContext, dataset: "products" | "customers" | "events" | "movements") {
  assertCan(ctx, "reports:export");
  switch (dataset) {
    case "products": {
      assertCan(ctx, "inventory:read");
      const rows = await db.equipmentProduct.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { sku: "asc" }, select: { sku: true, name: true, unit: true, stockManaged: true, alertThreshold: true, rentalPrice: true, replacementValue: true, weightKg: true, barcode: true, archivedAt: true, category: { select: { code: true } } } });
      return toCsv(
        [
          { key: "sku", label: "sku" }, { key: "name", label: "name" }, { key: "category_code", label: "category_code" }, { key: "unit", label: "unit" }, { key: "stock_managed", label: "stock_managed" },
          { key: "alert_threshold", label: "alert_threshold" }, { key: "rental_price", label: "rental_price" }, { key: "replacement_value", label: "replacement_value" }, { key: "weight_kg", label: "weight_kg" }, { key: "barcode", label: "barcode" }, { key: "archived", label: "archived" },
        ],
        rows.map((r) => ({ sku: r.sku, name: r.name, category_code: r.category.code, unit: r.unit, stock_managed: r.stockManaged ? "oui" : "non", alert_threshold: r.alertThreshold, rental_price: r.rentalPrice?.toFixed(2) ?? "", replacement_value: r.replacementValue?.toFixed(2) ?? "", weight_kg: r.weightKg?.toString() ?? "", barcode: r.barcode ?? "", archived: r.archivedAt ? "oui" : "non" })),
      );
    }
    case "customers": {
      assertCan(ctx, "customers:read");
      const rows = await db.customer.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { kind: true, name: true, firstName: true, lastName: true, email: true, phone: true, siret: true, vatNumber: true } });
      return toCsv(
        IMPORT_TEMPLATES.customers.filter((k) => k !== "notes").map((k) => ({ key: k, label: k })),
        rows.map((r) => ({ kind: r.kind === "COMPANY" ? "entreprise" : "particulier", name: r.name, first_name: r.firstName, last_name: r.lastName, email: r.email, phone: r.phone, siret: r.siret, vat_number: r.vatNumber })),
      );
    }
    case "events": {
      assertCan(ctx, "events:read");
      const rows = await db.event.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { startAt: "desc" }, select: { reference: true, name: true, status: true, startAt: true, endAt: true, timezone: true, city: true, customer: { select: { name: true } } } });
      return toCsv(
        [{ key: "reference", label: "Référence" }, { key: "name", label: "Nom" }, { key: "customer", label: "Client" }, { key: "status", label: "Statut" }, { key: "startAt", label: "Début (UTC)" }, { key: "endAt", label: "Fin (UTC)" }, { key: "timezone", label: "Fuseau" }, { key: "city", label: "Ville" }],
        rows.map((r) => ({ ...r, customer: r.customer.name, startAt: r.startAt.toISOString(), endAt: r.endAt.toISOString() })),
      );
    }
    case "movements": {
      assertCan(ctx, "stock:read");
      const rows = await db.stockMovement.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { occurredAt: "desc" }, take: 20_000, select: { occurredAt: true, type: true, quantity: true, reason: true, product: { select: { sku: true } }, fromLocation: { select: { code: true } }, toLocation: { select: { code: true } }, user: { select: { name: true } }, reservation: { select: { reference: true } } } });
      return toCsv(
        [{ key: "date", label: "Date (UTC)" }, { key: "type", label: "Type" }, { key: "sku", label: "SKU" }, { key: "quantity", label: "Quantité" }, { key: "from", label: "Source" }, { key: "to", label: "Destination" }, { key: "reason", label: "Motif" }, { key: "reservation", label: "Réservation" }, { key: "user", label: "Utilisateur" }],
        rows.map((r) => ({ date: r.occurredAt.toISOString(), type: r.type, sku: r.product.sku, quantity: r.quantity, from: r.fromLocation?.code, to: r.toLocation?.code, reason: r.reason, reservation: r.reservation?.reference, user: r.user?.name })),
      );
    }
  }
}
