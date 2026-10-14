import type { LocationKind, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { loadAuthContext, type AuthContext } from "@/server/auth/context";

let counter = 0;
export const uid = (prefix = "t") => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createOrg(name = "Org") {
  return db.organization.create({ data: { name: `${name} ${uid()}`, slug: uid("org-"), prepBufferHours: 0, returnBufferHours: 0 } });
}

export async function createUserInOrg(organizationId: string, role: Role): Promise<AuthContext> {
  const user = await db.user.create({ data: { email: `${uid("u")}@test.local`, name: `User ${role}`, passwordHash: "x" } });
  await db.membership.create({ data: { organizationId, userId: user.id, role } });
  return loadAuthContext(user.id, organizationId);
}

export async function createLocations(organizationId: string) {
  const mk = (code: string, kind: LocationKind) => db.stockLocation.create({ data: { organizationId, code, name: code, kind } });
  const [rackA, rackB, prep, ret, quarantine, maintenance, out] = await Promise.all([
    mk("A-01", "RACK"),
    mk("B-01", "RACK"),
    mk("PREP", "PREPARATION"),
    mk("RET", "RETURN"),
    mk("QUAR", "QUARANTINE"),
    mk("MAINT", "MAINTENANCE"),
    mk("OUT", "OUT"),
  ]);
  return { rackA, rackB, prep, ret, quarantine, maintenance, out };
}

export async function createProduct(organizationId: string, overrides: Partial<{ name: string; sku: string; stockManaged: boolean; weightKg: number }> = {}) {
  const category = await db.equipmentCategory.upsert({
    where: { organizationId_code: { organizationId, code: "LIGHT" } },
    create: { organizationId, code: "LIGHT", name: "Éclairage" },
    update: {},
  });
  return db.equipmentProduct.create({
    data: {
      organizationId,
      categoryId: category.id,
      name: overrides.name ?? "Projecteur LED",
      sku: overrides.sku ?? uid("SKU-"),
      stockManaged: overrides.stockManaged ?? true,
      rentalPrice: "25.00",
      replacementValue: "450.00",
      weightKg: overrides.weightKg ?? 5,
    },
  });
}

export async function createCustomer(organizationId: string) {
  return db.customer.create({ data: { organizationId, kind: "COMPANY", name: `Client ${uid()}`, email: "client@test.local" } });
}

export async function createEvent(organizationId: string, start: Date, end: Date, customerId?: string) {
  const cid = customerId ?? (await createCustomer(organizationId)).id;
  return db.event.create({
    data: { organizationId, reference: uid("EVT-"), name: `Événement ${uid()}`, customerId: cid, startAt: start, endAt: end, status: "CONFIRMED" },
  });
}

export const day = (n: number, hour = 9) => new Date(Date.UTC(2031, 0, n, hour, 0, 0));
