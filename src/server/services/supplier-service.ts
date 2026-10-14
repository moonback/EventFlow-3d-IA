import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { moneyOrZero } from "@/lib/serialize";
import type { supplierContactSchema, supplierSchema } from "@/features/suppliers/schemas";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";

export async function listSuppliers(ctx: AuthContext, query: ListQuery & { archived?: boolean }) {
  assertCan(ctx, "suppliers:read");
  const where: Prisma.SupplierWhereInput = {
    organizationId: ctx.organizationId,
    archivedAt: query.archived ? { not: null } : null,
    ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }, { city: { contains: query.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.supplier.findMany({
      where,
      orderBy: { name: query.dir },
      ...paginationArgs(query),
      select: { id: true, name: true, email: true, phone: true, city: true, archivedAt: true, _count: { select: { products: true, purchaseOrders: true } } },
    }),
    db.supplier.count({ where }),
  ]);
  return paginated(
    rows.map((s) => ({ id: s.id, name: s.name, email: s.email, phone: s.phone, city: s.city, archived: Boolean(s.archivedAt), productCount: s._count.products, orderCount: s._count.purchaseOrders })),
    total,
    query,
  );
}

export async function getSupplier(ctx: AuthContext, id: string) {
  assertCan(ctx, "suppliers:read");
  const s = await db.supplier.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true, name: true, email: true, phone: true, website: true, addressLine1: true, postalCode: true, city: true, country: true, siret: true, vatNumber: true, notes: true, archivedAt: true,
      contacts: { select: { id: true, firstName: true, lastName: true, jobTitle: true, email: true, phone: true } },
      products: { where: { archivedAt: null }, select: { id: true, sku: true, name: true }, orderBy: { name: "asc" }, take: 100 },
    },
  });
  if (!s) throw new NotFoundError("Fournisseur");
  const orders = ctx.permissions.has("purchases:read")
    ? await db.purchaseOrder.findMany({ where: { organizationId: ctx.organizationId, supplierId: id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, number: true, status: true, totalExclTax: true, createdAt: true } })
    : [];
  return {
    ...s,
    archivedAt: s.archivedAt?.toISOString() ?? null,
    orders: orders.map((o) => ({ ...o, totalExclTax: moneyOrZero(o.totalExclTax), createdAt: o.createdAt.toISOString() })),
  };
}

export async function createSupplier(ctx: AuthContext, data: z.output<typeof supplierSchema>) {
  assertCan(ctx, "suppliers:write");
  const s = await db.supplier.create({ data: { organizationId: ctx.organizationId, ...data }, select: { id: true, name: true } });
  await audit(ctx, "supplier.created", "Supplier", s.id, { name: s.name });
  return s;
}

export async function updateSupplier(ctx: AuthContext, id: string, data: z.output<typeof supplierSchema>) {
  assertCan(ctx, "suppliers:write");
  const result = await db.supplier.updateMany({ where: { id, organizationId: ctx.organizationId }, data });
  if (result.count === 0) throw new NotFoundError("Fournisseur");
  await audit(ctx, "supplier.updated", "Supplier", id, { name: data.name });
  return { id };
}

export async function setSupplierArchived(ctx: AuthContext, id: string, archived: boolean) {
  assertCan(ctx, "suppliers:write");
  const result = await db.supplier.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { archivedAt: archived ? new Date() : null } });
  if (result.count === 0) throw new NotFoundError("Fournisseur");
  await audit(ctx, archived ? "supplier.archived" : "supplier.restored", "Supplier", id);
}

export async function addSupplierContact(ctx: AuthContext, supplierId: string, data: z.output<typeof supplierContactSchema>) {
  assertCan(ctx, "suppliers:write");
  const s = await db.supplier.findFirst({ where: { id: supplierId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!s) throw new NotFoundError("Fournisseur");
  return db.supplierContact.create({ data: { supplierId, ...data }, select: { id: true } });
}

export async function supplierOptions(ctx: AuthContext) {
  assertCan(ctx, "suppliers:read");
  const rows = await db.supplier.findMany({ where: { organizationId: ctx.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return rows.map((r) => ({ value: r.id, label: r.name }));
}
