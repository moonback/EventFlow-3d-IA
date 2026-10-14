import "server-only";
import type { CustomerKind, Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { paginated, paginationArgs, type ListQuery } from "@/lib/pagination";
import { moneyOrZero } from "@/lib/serialize";
import type { addressSchema, contactSchema, customerSchema } from "@/features/customers/schemas";
import { audit, diffFields } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";

type CustomerData = z.output<typeof customerSchema>;

function displayName(data: CustomerData) {
  return data.kind === "COMPANY" ? data.name! : `${data.firstName} ${data.lastName}`;
}

export async function listCustomers(
  ctx: AuthContext,
  query: ListQuery & { kind?: CustomerKind; archived?: boolean },
) {
  assertCan(ctx, "customers:read");
  const where: Prisma.CustomerWhereInput = {
    organizationId: ctx.organizationId,
    archivedAt: query.archived ? { not: null } : null,
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { email: { contains: query.q, mode: "insensitive" } },
            { phone: { contains: query.q } },
            { contacts: { some: { OR: [{ lastName: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }] } } },
          ],
        }
      : {}),
  };
  const sortField = query.sort === "createdAt" ? "createdAt" : "name";
  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { [sortField]: query.dir },
      ...paginationArgs(query),
      select: {
        id: true,
        kind: true,
        name: true,
        email: true,
        phone: true,
        archivedAt: true,
        createdAt: true,
        _count: { select: { events: true, quotes: true } },
        addresses: { where: { isDefault: true }, select: { city: true }, take: 1 },
      },
    }),
    db.customer.count({ where }),
  ]);
  return paginated(
    rows.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      email: c.email,
      phone: c.phone,
      city: c.addresses[0]?.city ?? null,
      archived: Boolean(c.archivedAt),
      eventCount: c._count.events,
      quoteCount: c._count.quotes,
      createdAt: c.createdAt.toISOString(),
    })),
    total,
    query,
  );
}

export async function getCustomer(ctx: AuthContext, id: string) {
  assertCan(ctx, "customers:read");
  const c = await db.customer.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true,
      kind: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      siret: true,
      vatNumber: true,
      notes: true,
      archivedAt: true,
      createdAt: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }], select: { id: true, firstName: true, lastName: true, jobTitle: true, email: true, phone: true, isPrimary: true } },
      addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, kind: true, label: true, line1: true, line2: true, postalCode: true, city: true, country: true, isDefault: true } },
      events: { orderBy: { startAt: "desc" }, take: 50, select: { id: true, reference: true, name: true, status: true, startAt: true, timezone: true } },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, category: true, sizeBytes: true, createdAt: true } },
    },
  });
  if (!c) throw new NotFoundError("Client");
  const canQuotes = ctx.permissions.has("quotes:read");
  const canInvoices = ctx.permissions.has("invoices:read");
  const [quotes, invoices, history] = await Promise.all([
    canQuotes
      ? db.quote.findMany({ where: { organizationId: ctx.organizationId, customerId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, title: true, status: true, totalInclTax: true, createdAt: true } })
      : Promise.resolve([]),
    canInvoices
      ? db.invoice.findMany({ where: { organizationId: ctx.organizationId, customerId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, kind: true, title: true, status: true, totalInclTax: true, amountPaid: true, dueDate: true, createdAt: true } })
      : Promise.resolve([]),
    db.auditLog.findMany({ where: { organizationId: ctx.organizationId, entityType: "Customer", entityId: id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, createdAt: true, changes: true, actor: { select: { name: true } } } }),
  ]);
  return {
    ...c,
    archivedAt: c.archivedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    events: c.events.map((e) => ({ ...e, startAt: e.startAt.toISOString() })),
    documents: ctx.permissions.has("documents:read") ? c.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })) : [],
    quotes: quotes.map((q) => ({ ...q, totalInclTax: moneyOrZero(q.totalInclTax), createdAt: q.createdAt.toISOString() })),
    invoices: invoices.map((i) => ({ ...i, totalInclTax: moneyOrZero(i.totalInclTax), amountPaid: moneyOrZero(i.amountPaid), dueDate: i.dueDate?.toISOString() ?? null, createdAt: i.createdAt.toISOString() })),
    history: history.map((h) => ({ id: h.id, action: h.action, createdAt: h.createdAt.toISOString(), actor: h.actor?.name ?? null, changes: h.changes as Record<string, unknown> | null })),
    canSeeQuotes: canQuotes,
    canSeeInvoices: canInvoices,
  };
}

export async function createCustomer(ctx: AuthContext, data: CustomerData) {
  assertCan(ctx, "customers:write");
  const customer = await db.customer.create({
    data: { organizationId: ctx.organizationId, ...data, name: displayName(data), siret: data.siret?.replace(/\s/g, "") ?? null },
    select: { id: true, name: true },
  });
  await audit(ctx, "customer.created", "Customer", customer.id, { name: customer.name });
  return customer;
}

export async function updateCustomer(ctx: AuthContext, id: string, data: CustomerData) {
  assertCan(ctx, "customers:write");
  const existing = await db.customer.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Client");
  const next = { ...data, name: displayName(data), siret: data.siret?.replace(/\s/g, "") ?? null };
  const updated = await db.customer.update({ where: { id }, data: next, select: { id: true, name: true } });
  // L'historique ne conserve que les noms de champs modifiés pour les données personnelles
  const changes = diffFields(existing, next);
  await audit(ctx, "customer.updated", "Customer", id, { fields: Object.keys(changes) });
  return updated;
}

export async function setCustomerArchived(ctx: AuthContext, id: string, archived: boolean) {
  assertCan(ctx, "customers:write");
  const result = await db.customer.updateMany({
    where: { id, organizationId: ctx.organizationId },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (result.count === 0) throw new NotFoundError("Client");
  await audit(ctx, archived ? "customer.archived" : "customer.restored", "Customer", id);
}

async function assertCustomer(ctx: AuthContext, customerId: string) {
  const c = await db.customer.findFirst({ where: { id: customerId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!c) throw new NotFoundError("Client");
}

export async function addContact(ctx: AuthContext, customerId: string, data: z.output<typeof contactSchema>) {
  assertCan(ctx, "customers:write");
  await assertCustomer(ctx, customerId);
  return db.$transaction(async (tx) => {
    if (data.isPrimary) await tx.customerContact.updateMany({ where: { customerId }, data: { isPrimary: false } });
    const contact = await tx.customerContact.create({ data: { customerId, ...data }, select: { id: true } });
    await audit(ctx, "customer.contact_added", "Customer", customerId, { contactId: contact.id }, tx);
    return contact;
  });
}

export async function deleteContact(ctx: AuthContext, customerId: string, contactId: string) {
  assertCan(ctx, "customers:write");
  await assertCustomer(ctx, customerId);
  const result = await db.customerContact.deleteMany({ where: { id: contactId, customerId } });
  if (result.count === 0) throw new NotFoundError("Contact");
  await audit(ctx, "customer.contact_removed", "Customer", customerId, { contactId });
}

export async function addAddress(ctx: AuthContext, customerId: string, data: z.output<typeof addressSchema>) {
  assertCan(ctx, "customers:write");
  await assertCustomer(ctx, customerId);
  return db.$transaction(async (tx) => {
    if (data.isDefault) await tx.customerAddress.updateMany({ where: { customerId, kind: data.kind }, data: { isDefault: false } });
    const address = await tx.customerAddress.create({ data: { customerId, ...data }, select: { id: true } });
    await audit(ctx, "customer.address_added", "Customer", customerId, { addressId: address.id }, tx);
    return address;
  });
}

export async function deleteAddress(ctx: AuthContext, customerId: string, addressId: string) {
  assertCan(ctx, "customers:write");
  await assertCustomer(ctx, customerId);
  const result = await db.customerAddress.deleteMany({ where: { id: addressId, customerId } });
  if (result.count === 0) throw new NotFoundError("Adresse");
  await audit(ctx, "customer.address_removed", "Customer", customerId, { addressId });
}

/** Options légères pour les listes déroulantes. */
export async function customerOptions(ctx: AuthContext) {
  assertCan(ctx, "customers:read");
  const rows = await db.customer.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    take: 1000,
    select: { id: true, name: true },
  });
  return rows.map((r) => ({ value: r.id, label: r.name }));
}
