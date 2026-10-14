import "server-only";
import { db } from "@/lib/db";
import { can, type AuthContext } from "../auth/context";

export interface SearchHit {
  type: "customer" | "event" | "product" | "quote" | "invoice" | "vehicle" | "staff" | "reservation";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

/** Recherche globale — limitée à l'organisation et aux modules autorisés. */
export async function globalSearch(ctx: AuthContext, q: string): Promise<SearchHit[]> {
  const org = ctx.organizationId;
  const contains = { contains: q, mode: "insensitive" as const };
  const take = 5;
  const tasks: Promise<SearchHit[]>[] = [];
  if (can(ctx, "customers:read"))
    tasks.push(db.customer.findMany({ where: { organizationId: org, OR: [{ name: contains }, { email: contains }] }, take, select: { id: true, name: true, email: true } }).then((r) => r.map((c) => ({ type: "customer" as const, id: c.id, title: c.name, subtitle: c.email, href: `/customers/${c.id}` }))));
  if (can(ctx, "events:read"))
    tasks.push(db.event.findMany({ where: { organizationId: org, OR: [{ name: contains }, { reference: contains }, { city: contains }] }, take, orderBy: { startAt: "desc" }, select: { id: true, name: true, reference: true } }).then((r) => r.map((e) => ({ type: "event" as const, id: e.id, title: e.name, subtitle: e.reference, href: `/events/${e.id}` }))));
  if (can(ctx, "inventory:read"))
    tasks.push(db.equipmentProduct.findMany({ where: { organizationId: org, OR: [{ name: contains }, { sku: contains }, { barcode: q }] }, take, select: { id: true, name: true, sku: true } }).then((r) => r.map((p) => ({ type: "product" as const, id: p.id, title: p.name, subtitle: p.sku, href: `/inventory/${p.id}` }))));
  if (can(ctx, "reservations:read"))
    tasks.push(db.reservation.findMany({ where: { organizationId: org, reference: contains }, take, select: { id: true, reference: true, event: { select: { name: true } } } }).then((r) => r.map((x) => ({ type: "reservation" as const, id: x.id, title: x.reference, subtitle: x.event.name, href: `/reservations/${x.id}` }))));
  if (can(ctx, "quotes:read"))
    tasks.push(db.quote.findMany({ where: { organizationId: org, OR: [{ number: contains }, { title: contains }] }, take, select: { id: true, number: true, title: true } }).then((r) => r.map((x) => ({ type: "quote" as const, id: x.id, title: x.number, subtitle: x.title, href: `/quotes/${x.id}` }))));
  if (can(ctx, "invoices:read"))
    tasks.push(db.invoice.findMany({ where: { organizationId: org, OR: [{ number: contains }, { title: contains }] }, take, select: { id: true, number: true, title: true } }).then((r) => r.map((x) => ({ type: "invoice" as const, id: x.id, title: x.number ?? "Brouillon", subtitle: x.title, href: `/invoices/${x.id}` }))));
  if (can(ctx, "vehicles:read"))
    tasks.push(db.vehicle.findMany({ where: { organizationId: org, OR: [{ registration: contains }, { model: contains }] }, take, select: { id: true, registration: true, brand: true, model: true } }).then((r) => r.map((v) => ({ type: "vehicle" as const, id: v.id, title: v.registration, subtitle: `${v.brand} ${v.model}`, href: `/vehicles/${v.id}` }))));
  if (can(ctx, "staff:read"))
    tasks.push(db.staffMember.findMany({ where: { organizationId: org, OR: [{ firstName: contains }, { lastName: contains }] }, take, select: { id: true, firstName: true, lastName: true, jobTitle: true } }).then((r) => r.map((s) => ({ type: "staff" as const, id: s.id, title: `${s.firstName} ${s.lastName}`, subtitle: s.jobTitle, href: `/team/${s.id}` }))));
  return (await Promise.all(tasks)).flat();
}
