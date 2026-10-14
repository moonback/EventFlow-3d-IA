/**
 * Outils « monde 3D » d'Eric : déclarés à Gemini par la passerelle, exécutés dans le navigateur
 * par le pont de la scène (caméra, sélection, mise en évidence, avatar). Aucun n'écrit en base.
 * Module partagé client/serveur : uniquement des schémas Zod.
 */
import { z } from "zod";

const target = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .describe("Objet de la scène : « TYPE:identifiant » (ex. VEHICLE:abc, EVENT:xyz, STOCK_LOCATION:id), identifiant renvoyé par un outil, ou nom / référence (ex. « Renault Master », « A-03 »)");

export const SCENE_ZONES = ["OFFICE", "WAREHOUSE", "LOGISTICS", "EVENTS", "CONTROL"] as const;
const zone = z.enum(SCENE_ZONES).describe("OFFICE bureau de direction, WAREHOUSE entrepôt, LOGISTICS zone logistique (quais, véhicules), EVENTS frise des événements, CONTROL centre de contrôle");
const status = z.enum(["ok", "info", "warning", "danger", "idle"]).describe("ok normal, info en activité, warning attention, danger alerte, idle inactif");

export interface WorldTool<TInput extends z.ZodType = z.ZodType> {
  name: string;
  label: string;
  description: string;
  input: TInput;
}

const tool = <T extends z.ZodType>(t: WorldTool<T>) => t as unknown as WorldTool;

export const WORLD_TOOLS: WorldTool[] = [
  tool({
    name: "show_object",
    label: "la scène",
    description: "Montre un objet du monde 3D : la caméra le cadre, sa fiche s'ouvre et Eric va se placer à côté pour le désigner. À utiliser dès que tu parles d'un véhicule, d'un emplacement de stock, d'un quai ou d'un événement.",
    input: z.object({ target }),
  }),
  tool({
    name: "go_to_zone",
    label: "la scène",
    description: "Déplace la caméra et Eric vers une zone du site, ou vers la vue d'ensemble.",
    input: z.object({ zone: z.union([zone, z.literal("OVERVIEW")]).describe("Zone, ou OVERVIEW pour la vue d'ensemble") }),
  }),
  tool({
    name: "highlight",
    label: "la scène",
    description: "Met en évidence plusieurs objets (liste de cibles) ou tous les objets d'un état. Sans argument, efface la mise en évidence.",
    input: z.object({ targets: z.array(target).max(30).optional(), status: status.optional() }),
  }),
  tool({
    name: "locate_equipment",
    label: "l'entrepôt",
    description: "Localise un matériel dans l'entrepôt : met en évidence ses emplacements et trace le chemin depuis l'entrée.",
    input: z.object({ query: z.string().trim().min(1).max(100).describe("Nom, SKU ou code-barres du matériel") }),
  }),
  tool({
    name: "set_view",
    label: "la scène",
    description: "Change l'affichage : mode 3D ou plan 2D, calque de chaleur (sorties de stock sur 90 jours), calque de comptage (inventaire tournant du jour) ou aucun calque.",
    input: z.object({ mode: z.enum(["3d", "plan"]).optional(), overlay: z.enum(["heat", "count", "none"]).optional() }),
  }),
  tool({
    name: "show_timeline",
    label: "la frise des événements",
    description: "Fait glisser la caméra le long de la frise des événements jusqu'à une date (de 14 jours avant à 60 jours après aujourd'hui).",
    input: z.object({ date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date (AAAA-MM-JJ)") }),
  }),
  tool({
    name: "start_meeting",
    label: "la salle de réunion",
    description: "Ouvre une réunion de préparation d'un événement : son dossier s'affiche sur l'écran de la salle de réunion.",
    input: z.object({ event: target }),
  }),
  tool({
    name: "simulate_loading",
    label: "le plan de chargement",
    description: "Joue l'animation du plan de chargement d'un véhicule pour sa mission en cours ou la prochaine.",
    input: z.object({ vehicle: target }),
  }),
  tool({
    name: "get_scene",
    label: "la scène",
    description: "Décrit la scène : ce que l'utilisateur regarde (objet sélectionné, mode, calque) et les objets présents, filtrables par type, état ou texte. Utile pour trouver la cible à montrer.",
    input: z.object({
      kind: z.enum(["STOCK_LOCATION", "VEHICLE", "DOCK", "EVENT", "STAFF_DESK"]).optional(),
      status: status.optional(),
      query: z.string().trim().min(1).max(100).optional(),
    }),
  }),
];

const BY_NAME = new Map(WORLD_TOOLS.map((t) => [t.name, t]));

export function findWorldTool(name: string) {
  return BY_NAME.get(name);
}

export function worldToolDeclarations() {
  return WORLD_TOOLS.map((t) => {
    const { $schema: _schema, ...parameters } = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
    return { name: t.name, description: t.description, parametersJsonSchema: parameters };
  });
}

/** Résultat d'une commande de scène renvoyé à Gemini (toujours factuel : Eric ne doit pas prétendre avoir montré un objet absent). */
export type WorldResult = { ok: true; [key: string]: unknown } | { ok: false; error: WorldErrorCode; message: string; suggestions?: string[] };

export const WORLD_ERROR_CODES = ["UNKNOWN_OBJECT", "AMBIGUOUS", "UNAVAILABLE", "INVALID_ARGUMENTS", "UNKNOWN_TOOL", "FAILED"] as const;
export type WorldErrorCode = (typeof WORLD_ERROR_CODES)[number];

export function isWorldErrorCode(value: unknown): value is WorldErrorCode {
  return typeof value === "string" && (WORLD_ERROR_CODES as readonly string[]).includes(value);
}
