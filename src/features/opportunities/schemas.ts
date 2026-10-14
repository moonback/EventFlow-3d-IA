import { z } from "zod";
import { optionalId, optionalInt, optionalMoney, optionalPhone, optionalText, requiredText } from "@/lib/zod-helpers";

export const OPPORTUNITY_STAGES = ["NEW", "QUALIFIED", "QUOTE_SENT", "WON", "LOST"] as const;

/** Date du jour seule (AAAA-MM-JJ), sans heure ni fuseau. */
const isoDay = z
  .string()
  .trim()
  .min(1, "Indiquez la date de l'événement")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Date invalide");

/**
 * Demande de devis envoyée depuis la page publique /demande/[slug].
 * `website` est un piège à robots (champ masqué qui doit rester vide) et `startedAt` l'heure
 * d'affichage du formulaire : une soumission instantanée trahit un automate.
 */
export const publicQuoteRequestSchema = z.object({
  contactName: requiredText(120, "Indiquez votre nom"),
  contactEmail: z.string().trim().toLowerCase().max(200).email("Adresse e-mail invalide"),
  contactPhone: optionalPhone,
  companyName: optionalText(200),
  eventTypeId: optionalId,
  eventDate: isoDay,
  venue: requiredText(200, "Indiquez le lieu ou la ville"),
  guestCount: z.coerce
    .number({ error: "Nombre d'invités attendu" })
    .int("Nombre entier attendu")
    .min(1, "Au moins 1 invité")
    .max(100_000, "Nombre d'invités trop élevé"),
  budget: optionalMoney,
  message: optionalText(3000),
  consent: z.literal(true, { error: "Votre accord est nécessaire pour traiter la demande" }),
  website: z.string().max(500).optional().default(""),
  startedAt: z.coerce.number().int().optional(),
});
export type PublicQuoteRequestInput = z.input<typeof publicQuoteRequestSchema>;

export const opportunityListQuerySchema = z.object({
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
});

/** Suivi d'une opportunité par l'équipe commerciale. */
export const opportunityUpdateSchema = z
  .object({
    stage: z.enum(OPPORTUNITY_STAGES),
    estimatedAmount: optionalMoney,
    probability: z.coerce.number().int().min(0, "Entre 0 et 100").max(100, "Entre 0 et 100"),
    lossReason: optionalText(500),
    ownerId: optionalId,
    guestCount: optionalInt,
    venue: optionalText(200),
  })
  .refine((v) => v.stage !== "LOST" || Boolean(v.lossReason), { path: ["lossReason"], message: "Indiquez le motif de perte" });
export type OpportunityUpdateInput = z.input<typeof opportunityUpdateSchema>;

export const publicFormSettingsSchema = z.object({ enabled: z.boolean() });
