import { z } from "zod";
import {
  idSchema,
  localDateTime,
  optionalDate,
  optionalId,
  optionalInt,
  optionalLocalDateTime,
  optionalMoney,
  optionalText,
  requiredText,
  timezone,
} from "@/lib/zod-helpers";

export const EVENT_STATUSES = ["DRAFT", "QUOTED", "CONFIRMED", "IN_PREPARATION", "READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

/** Les dates sont saisies en heure locale du lieu de l'événement + fuseau IANA. */
export const eventSchema = z.object({
  name: requiredText(200),
  customerId: idSchema,
  eventTypeId: optionalId,
  managerId: optionalId,
  timezone: timezone.default("Europe/Paris"),
  startLocal: localDateTime,
  endLocal: localDateTime,
  setupStartLocal: optionalLocalDateTime,
  teardownEndLocal: optionalLocalDateTime,
  venueName: optionalText(200),
  addressLine1: optionalText(200),
  postalCode: optionalText(12),
  city: optionalText(100),
  country: z.string().trim().length(2).default("FR"),
  guestCount: optionalInt,
  budgetAmount: optionalMoney,
  estimatedCost: optionalMoney,
  description: optionalText(10_000),
});
export type EventFormInput = z.input<typeof eventSchema>;
export type EventData = z.output<typeof eventSchema>;

export const eventStatusSchema = z.object({
  status: z.enum(EVENT_STATUSES),
  reason: optionalText(500),
});

export const eventNoteSchema = z.object({ body: requiredText(5000) });

export const taskSchema = z.object({
  title: requiredText(200),
  description: optionalText(5000),
  eventId: optionalId,
  assigneeId: optionalId,
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  dueAt: optionalDate,
});
export const taskUpdateSchema = taskSchema.partial().extend({
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
});

export const eventTypeSchema = z.object({
  name: requiredText(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
});
