import "server-only";
import { z, type ZodType } from "zod";
import { db } from "@/lib/db";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { eventStatusLabels, taskPriorityLabels } from "@/lib/labels";
import type { Permission } from "@/lib/permissions";
import { audit } from "../audit";
import type { AuthContext } from "../auth/context";
import { addEventNote, changeEventStatus, createTask } from "../services/event-service";
import { recordManualMovement } from "../services/stock-movement-service";
import { localDateTime } from "./compact";
import { dateArg, declaration, idArg, parseDate, textArg } from "./tool-args";

/**
 * Outils « actions » d'Eric : écritures dans EventFlow, TOUJOURS soumises à la confirmation de
 * l'utilisateur par un clic. `prepare` décrit l'action à partir de la base (jamais du texte du
 * modèle, hormis le contenu saisi lui-même, affiché tel quel) ; `execute` n'est appelé qu'après
 * le clic « Confirmer », par les mêmes services que les pages (droits et règles métier inclus).
 */
export interface ActionPreview {
  title: string;
  details: string[];
  /** Action aux effets importants : bouton de confirmation mis en garde */
  danger?: boolean;
}

export interface ActionTool<TInput extends ZodType = ZodType> {
  name: string;
  description: string;
  permissions: Permission[];
  input: TInput;
  prepare(ctx: AuthContext, input: z.output<TInput>): Promise<ActionPreview>;
  execute(ctx: AuthContext, input: z.output<TInput>): Promise<Record<string, unknown>>;
}

const tool = <T extends ZodType>(t: ActionTool<T>) => t as unknown as ActionTool;

/** Statuts accessibles par Eric : l'annulation (qui annule réservations et affectations) reste dans l'interface. */
const ASSISTANT_EVENT_STATUS = z.enum(["DRAFT", "QUOTED", "CONFIRMED", "IN_PREPARATION", "READY", "IN_PROGRESS", "COMPLETED"]);

async function findEvent(ctx: AuthContext, id: string) {
  const e = await db.event.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, name: true, reference: true, status: true } });
  if (!e) throw new NotFoundError("Événement");
  return e;
}

const eventLabel = (e: { name: string; reference: string }) => `${e.name} (${e.reference})`;

export const ACTION_TOOLS: ActionTool[] = [
  tool({
    name: "change_event_status",
    description: "Propose de changer le statut d'un événement (l'utilisateur confirme à l'écran). L'annulation n'est pas possible par ce moyen : elle se fait depuis la fiche de l'événement.",
    permissions: ["events:write"],
    input: z.object({ event_id: idArg("de l'événement"), status: ASSISTANT_EVENT_STATUS.describe("Nouveau statut") }),
    async prepare(ctx, i) {
      const e = await findEvent(ctx, i.event_id);
      if (e.status === "CANCELLED") throw new BusinessRuleError("EVENT_CLOSED", "Événement annulé : son statut ne peut plus changer");
      if (e.status === i.status) throw new BusinessRuleError("NO_CHANGE", `L'événement est déjà au statut « ${eventStatusLabels[e.status]} »`);
      return { title: "Changer le statut de l'événement", details: [eventLabel(e), `${eventStatusLabels[e.status]} → ${eventStatusLabels[i.status]}`], danger: i.status === "COMPLETED" };
    },
    async execute(ctx, i) {
      const r = await changeEventStatus(ctx, i.event_id, i.status, null);
      return { status: eventStatusLabels[r.status] };
    },
  }),
  tool({
    name: "add_event_note",
    description: "Propose d'ajouter une note au dossier d'un événement (l'utilisateur confirme à l'écran).",
    permissions: ["events:write"],
    input: z.object({ event_id: idArg("de l'événement"), text: textArg("Texte de la note, tel que dicté par l'utilisateur", 2000) }),
    async prepare(ctx, i) {
      const e = await findEvent(ctx, i.event_id);
      return { title: "Ajouter une note à l'événement", details: [eventLabel(e), `« ${i.text} »`] };
    },
    async execute(ctx, i) {
      const note = await addEventNote(ctx, i.event_id, { body: i.text });
      await audit(ctx, "event.note_added", "Event", i.event_id, { noteId: note.id });
      return { noteId: note.id };
    },
  }),
  tool({
    name: "create_task",
    description: "Propose de créer une tâche, liée ou non à un événement (l'utilisateur confirme à l'écran).",
    permissions: ["tasks:write"],
    input: z.object({
      title: textArg("Intitulé de la tâche", 200),
      event_id: idArg("de l'événement").optional(),
      due_date: dateArg("Échéance").optional(),
      priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
    }),
    async prepare(ctx, i) {
      const details = [`« ${i.title} »`];
      if (i.event_id) details.push(`Événement : ${eventLabel(await findEvent(ctx, i.event_id))}`);
      if (i.due_date) details.push(`Échéance : ${localDateTime(parseDate(i.due_date, ctx.organization.timezone), ctx.organization.timezone)}`);
      details.push(`Priorité : ${taskPriorityLabels[i.priority ?? "NORMAL"]}`);
      return { title: "Créer une tâche", details };
    },
    async execute(ctx, i) {
      const task = await createTask(ctx, {
        title: i.title,
        description: null,
        eventId: i.event_id ?? null,
        assigneeId: null,
        priority: i.priority ?? "NORMAL",
        dueAt: i.due_date ? parseDate(i.due_date, ctx.organization.timezone) : null,
      });
      return { taskId: task.id };
    },
  }),
  tool({
    name: "transfer_stock",
    description: "Propose de transférer une quantité de matériel d'un emplacement à un autre (l'utilisateur confirme à l'écran). Utiliser find_equipment pour obtenir le matériel et ses emplacements.",
    permissions: ["stock:write"],
    input: z.object({
      product_id: idArg("du matériel"),
      from_location_id: idArg("de l'emplacement de départ"),
      to_location_id: idArg("de l'emplacement d'arrivée"),
      quantity: z.number().int().min(1).max(10_000).describe("Quantité à transférer"),
    }),
    async prepare(ctx, i) {
      if (i.from_location_id === i.to_location_id) throw new BusinessRuleError("SAME_LOCATION", "Les emplacements de départ et d'arrivée sont identiques");
      const [product, from, to] = await Promise.all([
        db.equipmentProduct.findFirst({ where: { id: i.product_id, organizationId: ctx.organizationId }, select: { name: true, sku: true } }),
        db.stockLocation.findFirst({ where: { id: i.from_location_id, organizationId: ctx.organizationId }, select: { code: true, name: true } }),
        db.stockLocation.findFirst({ where: { id: i.to_location_id, organizationId: ctx.organizationId }, select: { code: true, name: true } }),
      ]);
      if (!product) throw new NotFoundError("Matériel");
      if (!from || !to) throw new NotFoundError("Emplacement");
      const balance = await db.stockBalance.findFirst({ where: { organizationId: ctx.organizationId, productId: i.product_id, locationId: i.from_location_id }, select: { quantity: true } });
      const available = balance?.quantity ?? 0;
      if (available < i.quantity) throw new BusinessRuleError("INSUFFICIENT_STOCK", `Seulement ${available} unité(s) de ${product.name} en ${from.code}`);
      return { title: "Transférer du matériel", details: [`${i.quantity} × ${product.name} (${product.sku})`, `${from.code} → ${to.code}`] };
    },
    async execute(ctx, i) {
      const m = await recordManualMovement(ctx, { type: "TRANSFER", productId: i.product_id, quantity: i.quantity, fromLocationId: i.from_location_id, toLocationId: i.to_location_id, reason: "Transfert demandé à l'assistant Eric" });
      return { movementId: m.id };
    },
  }),
];

const BY_NAME = new Map(ACTION_TOOLS.map((t) => [t.name, t]));

export function findActionTool(name: string) {
  return BY_NAME.get(name);
}

export function actionToolDeclarations() {
  return ACTION_TOOLS.map((t) => declaration(t.name, t.description, t.input));
}
