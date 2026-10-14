import "server-only";
import { z, type ZodType } from "zod";
import { addDays, startOfDayInZone, zonedLocalToUtc } from "@/lib/dates";
import { isAppError } from "@/lib/errors";
import type { Permission } from "@/lib/permissions";
import { can, type AuthContext } from "../auth/context";
import { checkAvailability } from "../services/availability-service";
import { getCustomer, listCustomers } from "../services/customer-service";
import { getDashboard } from "../services/dashboard-service";
import { getEvent, listEvents, listTasks } from "../services/event-service";
import { financeOverview, getEventFinancials } from "../services/finance-service";
import { findProductLocations, listProducts } from "../services/inventory-service";
import { listInvoices } from "../services/invoice-service";
import { logisticsBoard } from "../services/logistics-service";
import { listMaintenance } from "../services/maintenance-service";
import { listNotifications } from "../services/notification-service";
import { listQuotes } from "../services/quote-service";
import { listReservations } from "../services/reservation-service";
import { listStaff, staffSchedule } from "../services/staff-service";
import { getEventLoad, getVehicle, listVehicles } from "../services/vehicle-service";
import { globalSearch } from "../services/search-service";
import { compact, MAX_RESULT_CHARS } from "./compact";
import { dateArg, declaration, idArg, parseDate, textArg } from "./tool-args";

/**
 * Outils « données » d'Eric : lecture seule, exécutés dans la passerelle avec l'AuthContext de
 * l'utilisateur. Les services revérifient les permissions et filtrent par organisation : Eric ne
 * voit jamais plus que l'utilisateur.
 */
export interface DataTool<TInput extends ZodType = ZodType> {
  name: string;
  /** Libellé affiché pendant l'exécution (« Eric consulte … ») */
  label: string;
  description: string;
  /** Permissions toutes requises (vérifiées avant l'appel, en plus des services) */
  permissions: Permission[];
  input: TInput;
  run(ctx: AuthContext, input: z.output<TInput>): Promise<unknown>;
}

const tool = <T extends ZodType>(t: DataTool<T>) => t as unknown as DataTool;

const LIST = { page: 1, dir: "asc" as const };
const id = idArg;
const text = (what: string) => textArg(what);

function range(ctx: AuthContext, from: string | undefined, to: string | undefined, defaultDays: number) {
  const tz = ctx.organization.timezone;
  const start = from ? parseDate(from, tz) : startOfDayInZone(new Date(), tz);
  const end = to ? parseDate(to, tz, true) : addDays(start, defaultDays);
  return { start, end: end > start ? end : addDays(start, 1) };
}

const EVENT_STATUS = z.enum(["DRAFT", "QUOTED", "CONFIRMED", "IN_PREPARATION", "READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export const DATA_TOOLS: DataTool[] = [
  tool({
    name: "search",
    label: "recherche dans EventFlow",
    description: "Recherche par nom ou référence parmi les clients, événements, matériels et réservations. À utiliser en premier pour retrouver un identifiant.",
    permissions: [],
    input: z.object({ query: text("Texte recherché (nom, référence, ville, SKU…)") }),
    run: (ctx, { query }) => globalSearch(ctx, query),
  }),
  tool({
    name: "get_overview",
    label: "le tableau de bord",
    description: "Vue d'ensemble du jour : indicateurs clés, événements à venir, départs et retours, alertes de stock et de véhicules.",
    permissions: ["dashboard:read"],
    input: z.object({}),
    run: (ctx) => getDashboard(ctx),
  }),
  tool({
    name: "list_events",
    label: "les événements",
    description: "Liste des événements qui chevauchent une période (par défaut les 30 prochains jours), avec filtres facultatifs.",
    permissions: ["events:read"],
    input: z.object({
      query: text("Filtre texte : nom, référence, ville ou client").optional(),
      status: EVENT_STATUS.optional().describe("Statut de l'événement"),
      from: dateArg("Début de période").optional(),
      to: dateArg("Fin de période (incluse)").optional(),
    }),
    run: async (ctx, i) => {
      const { start, end } = range(ctx, i.from, i.to, 30);
      const r = await listEvents(ctx, { ...LIST, pageSize: 15, sort: "startAt", q: i.query, status: i.status, from: start, to: end });
      return { total: r.total, events: r.items };
    },
  }),
  tool({
    name: "get_event",
    label: "le dossier de l'événement",
    description: "Dossier complet d'un événement : client, lieu, dates, tâches, réservations de matériel, véhicules et personnel affectés, devis et factures.",
    permissions: ["events:read"],
    input: z.object({ event_id: id("de l'événement") }),
    run: async (ctx, { event_id }) => {
      const { history: _history, documents, notes, ...e } = await getEvent(ctx, event_id);
      return { ...e, notes: notes.slice(0, 5), documentCount: documents.length };
    },
  }),
  tool({
    name: "get_event_financials",
    label: "la rentabilité de l'événement",
    description: "Chiffre d'affaires, coûts (matériel, personnel, véhicules, dépenses) et marge d'un événement.",
    permissions: ["finance:read"],
    input: z.object({ event_id: id("de l'événement") }),
    run: (ctx, { event_id }) => getEventFinancials(ctx, event_id),
  }),
  tool({
    name: "get_event_load",
    label: "le chargement de l'événement",
    description: "Poids et volume total du matériel réservé pour un événement (pour choisir les véhicules).",
    permissions: ["vehicles:read"],
    input: z.object({ event_id: id("de l'événement") }),
    run: (ctx, { event_id }) => getEventLoad(ctx, event_id),
  }),
  tool({
    name: "find_equipment",
    label: "le stock",
    description: "Recherche de matériel par nom, SKU ou code-barres : stock total, disponible maintenant, réservé, en maintenance, stock bas, et emplacements dans l'entrepôt.",
    permissions: ["inventory:read"],
    input: z.object({ query: text("Nom, SKU ou code-barres du matériel") }),
    run: async (ctx, { query }) => {
      const [products, located] = await Promise.all([listProducts(ctx, { ...LIST, pageSize: 10, sort: "name", q: query }), findProductLocations(ctx, query)]);
      const where = new Map(located.map((p) => [p.id, p.locations.map((l) => `${l.code} (${l.quantity})`)]));
      return {
        total: products.total,
        products: products.items.map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category?.name, stock: p.stock, lowStock: p.lowStock, archived: p.archived, locations: where.get(p.id) })),
      };
    },
  }),
  tool({
    name: "check_availability",
    label: "la disponibilité du matériel",
    description: "Quantité disponible d'un matériel sur une période (réservations et délais de préparation/retour compris).",
    permissions: ["inventory:read"],
    input: z.object({ product_id: id("du matériel"), from: dateArg("Début de période"), to: dateArg("Fin de période (incluse)") }),
    run: async (ctx, i) => {
      const { start, end } = range(ctx, i.from, i.to, 1);
      return checkAvailability(ctx, { productIds: [i.product_id], startAt: start, endAt: end });
    },
  }),
  tool({
    name: "list_low_stock",
    label: "les stocks bas",
    description: "Matériels dont le stock disponible est sous le seuil d'alerte.",
    permissions: ["inventory:read"],
    input: z.object({}),
    run: async (ctx) => {
      const r = await listProducts(ctx, { ...LIST, pageSize: 20, sort: "name", lowStock: true });
      return { total: r.total, products: r.items.map((p) => ({ id: p.id, sku: p.sku, name: p.name, availableNow: p.stock?.availableNow, alertThreshold: p.alertThreshold })) };
    },
  }),
  tool({
    name: "list_reservations",
    label: "les réservations",
    description: "Réservations de matériel, filtrables par statut ou par événement.",
    permissions: ["reservations:read"],
    input: z.object({
      status: z.enum(["DRAFT", "PENDING", "CONFIRMED", "IN_PREPARATION", "PREPARED", "SHIPPED", "PARTIALLY_RETURNED", "RETURNED", "CANCELLED"]).optional(),
      event_id: id("de l'événement").optional(),
    }),
    run: async (ctx, i) => {
      const r = await listReservations(ctx, { ...LIST, pageSize: 15, sort: "startAt", status: i.status, eventId: i.event_id });
      return { total: r.total, reservations: r.items };
    },
  }),
  tool({
    name: "logistics_board",
    label: "le planning logistique",
    description: "Préparations, départs et retours de matériel prévus sur les prochains jours.",
    permissions: ["reservations:read"],
    input: z.object({ days: z.number().int().min(1).max(30).optional().describe("Horizon en jours (14 par défaut)") }),
    run: (ctx, { days }) => logisticsBoard(ctx, days ?? 14),
  }),
  tool({
    name: "list_vehicles",
    label: "les véhicules",
    description: "Parc de véhicules avec leur situation (disponible, affecté, en mission, en maintenance, indisponible) et leurs alertes (contrôle technique, assurance, entretien).",
    permissions: ["vehicles:read"],
    input: z.object({ status: z.enum(["AVAILABLE", "ASSIGNED", "ON_MISSION", "MAINTENANCE", "UNAVAILABLE"]).optional() }),
    run: async (ctx, { status }) => {
      const r = await listVehicles(ctx, { ...LIST, pageSize: 30, ops: status });
      return { total: r.total, vehicles: r.items };
    },
  }),
  tool({
    name: "get_vehicle",
    label: "la fiche du véhicule",
    description: "Fiche d'un véhicule : caractéristiques, échéances, affectations et entretiens.",
    permissions: ["vehicles:read"],
    input: z.object({ vehicle_id: id("du véhicule") }),
    run: (ctx, { vehicle_id }) => getVehicle(ctx, vehicle_id),
  }),
  tool({
    name: "list_staff",
    label: "l'équipe",
    description: "Collaborateurs (salariés, intermittents, freelances) avec leurs compétences.",
    permissions: ["staff:read"],
    input: z.object({ query: text("Filtre texte : nom, poste").optional() }),
    run: async (ctx, { query }) => {
      const r = await listStaff(ctx, { ...LIST, pageSize: 20, sort: "lastName", q: query, active: true });
      return { total: r.total, staff: r.items };
    },
  }),
  tool({
    name: "staff_schedule",
    label: "le planning de l'équipe",
    description: "Affectations et indisponibilités du personnel sur une période (par défaut les 7 prochains jours).",
    permissions: ["staff:read"],
    input: z.object({ from: dateArg("Début de période").optional(), to: dateArg("Fin de période (incluse)").optional() }),
    run: (ctx, i) => {
      const { start, end } = range(ctx, i.from, i.to, 7);
      return staffSchedule(ctx, start, end);
    },
  }),
  tool({
    name: "find_customer",
    label: "les clients",
    description: "Recherche de clients par nom ou e-mail.",
    permissions: ["customers:read"],
    input: z.object({ query: text("Nom ou e-mail du client") }),
    run: async (ctx, { query }) => {
      const r = await listCustomers(ctx, { ...LIST, pageSize: 10, sort: "name", q: query });
      return { total: r.total, customers: r.items };
    },
  }),
  tool({
    name: "get_customer",
    label: "la fiche client",
    description: "Fiche d'un client : contacts, adresses, événements et chiffres.",
    permissions: ["customers:read"],
    input: z.object({ customer_id: id("du client") }),
    run: (ctx, { customer_id }) => getCustomer(ctx, customer_id),
  }),
  tool({
    name: "list_quotes",
    label: "les devis",
    description: "Devis, filtrables par statut ; follow_up = devis envoyés à relancer.",
    permissions: ["quotes:read"],
    input: z.object({ status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]).optional(), follow_up: z.boolean().optional() }),
    run: async (ctx, i) => {
      const r = await listQuotes(ctx, { ...LIST, pageSize: 15, dir: "desc", status: i.status, followUp: i.follow_up });
      return { total: r.total, quotes: r.items };
    },
  }),
  tool({
    name: "list_invoices",
    label: "les factures",
    description: "Factures, filtrables par statut ; overdue = factures échues non réglées.",
    permissions: ["invoices:read"],
    input: z.object({ status: z.enum(["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"]).optional(), overdue: z.boolean().optional() }),
    run: async (ctx, i) => {
      const r = await listInvoices(ctx, { ...LIST, pageSize: 15, dir: "desc", status: i.status, overdue: i.overdue });
      return { total: r.total, invoices: r.items };
    },
  }),
  tool({
    name: "finance_overview",
    label: "les finances",
    description: "Synthèse financière d'une période (par défaut le mois en cours) : chiffre d'affaires, encaissements, coûts, marge.",
    permissions: ["finance:read"],
    input: z.object({ from: dateArg("Début de période").optional(), to: dateArg("Fin de période (incluse)").optional() }),
    run: (ctx, i) => {
      const tz = ctx.organization.timezone;
      const today = startOfDayInZone(new Date(), tz);
      const monthStart = zonedLocalToUtc(`${new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(today)}-01T00:00`, tz);
      const start = i.from ? parseDate(i.from, tz) : monthStart;
      const end = i.to ? parseDate(i.to, tz, true) : addDays(today, 1);
      return financeOverview(ctx, start, end);
    },
  }),
  tool({
    name: "list_tasks",
    label: "les tâches",
    description: "Tâches des événements ; overdue = en retard ; mine = celles de l'interlocuteur.",
    permissions: ["events:read"],
    input: z.object({ status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(), overdue: z.boolean().optional(), mine: z.boolean().optional() }),
    run: async (ctx, i) => {
      const r = await listTasks(ctx, { ...LIST, pageSize: 20, status: i.status, overdue: i.overdue, mine: i.mine });
      return { total: r.total, tasks: r.items };
    },
  }),
  tool({
    name: "list_maintenance",
    label: "la maintenance du matériel",
    description: "Tickets de maintenance du matériel (par défaut ceux encore ouverts).",
    permissions: ["stock:read"],
    input: z.object({ include_closed: z.boolean().optional() }),
    run: async (ctx, i) => {
      const r = await listMaintenance(ctx, { ...LIST, pageSize: 20, dir: "desc", open: i.include_closed ? undefined : true });
      return { total: r.total, tickets: r.items };
    },
  }),
  tool({
    name: "list_notifications",
    label: "vos notifications",
    description: "Notifications et alertes de l'interlocuteur (retards, départs imminents, échéances, stock bas…).",
    permissions: [],
    input: z.object({ unread_only: z.boolean().optional() }),
    run: (ctx, i) => listNotifications(ctx, { unreadOnly: i.unread_only, take: 15 }),
  }),
];

const BY_NAME = new Map(DATA_TOOLS.map((t) => [t.name, t]));

export function findDataTool(name: string) {
  return BY_NAME.get(name);
}

/** Déclarations envoyées à Gemini (schémas Zod convertis en JSON Schema). */
export function dataToolDeclarations() {
  return DATA_TOOLS.map((t) => declaration(t.name, t.description, t.input));
}

export type ToolOutcome = { ok: true; output: unknown } | { ok: false; error: string; message: string };

/**
 * Exécute un outil « données » pour l'utilisateur. Ne lève jamais : toute erreur devient une
 * réponse explicite pour Gemini (FORBIDDEN, NOT_FOUND, INVALID_ARGUMENTS…), sans détail interne.
 */
export async function runDataTool(ctx: AuthContext, name: string, args: unknown): Promise<ToolOutcome> {
  const t = BY_NAME.get(name);
  if (!t) return { ok: false, error: "UNKNOWN_TOOL", message: `Outil inconnu : ${name}` };
  if (t.permissions.some((p) => !can(ctx, p))) return { ok: false, error: "FORBIDDEN", message: "L'interlocuteur n'a pas les droits pour consulter ces informations" };
  const parsed = t.input.safeParse(args ?? {});
  if (!parsed.success) return { ok: false, error: "INVALID_ARGUMENTS", message: parsed.error.issues.map((i) => `${i.path.join(".") || "arguments"} : ${i.message}`).join(" ; ") };
  try {
    const output = compact(await t.run(ctx, parsed.data), { timezone: ctx.organization.timezone });
    if (JSON.stringify(output).length > MAX_RESULT_CHARS * 1.5) return { ok: false, error: "RESULT_TOO_LARGE", message: "Résultat trop volumineux : précisez la demande" };
    return { ok: true, output };
  } catch (error) {
    return toolError(name, error);
  }
}

/** Erreur d'outil → réponse explicite pour Gemini, sans détail interne. */
export function toolError(name: string, error: unknown): Extract<ToolOutcome, { ok: false }> {
  if (isAppError(error)) {
    if (error.status === 403) return { ok: false, error: "FORBIDDEN", message: "L'interlocuteur n'a pas les droits pour cette opération" };
    if (error.status === 404) return { ok: false, error: "NOT_FOUND", message: error.message };
    return { ok: false, error: error.code, message: error.message };
  }
  if (error instanceof RangeError) return { ok: false, error: "INVALID_ARGUMENTS", message: error.message };
  console.error(`[assistant] tool ${name} failed`, error);
  return { ok: false, error: "INTERNAL", message: "Erreur interne pendant l'opération" };
}
