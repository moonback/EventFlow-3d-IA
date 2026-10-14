import { z } from "zod";
import { decimalString, idSchema, optionalEmail, optionalId, optionalMoney, optionalPhone, optionalText, requiredText } from "@/lib/zod-helpers";

export const staffSchema = z.object({
  firstName: requiredText(100),
  lastName: requiredText(100),
  email: optionalEmail,
  phone: optionalPhone,
  jobTitle: optionalText(100),
  employmentType: z.enum(["EMPLOYEE", "FREELANCE", "INTERMITTENT", "TEMP"]).default("EMPLOYEE"),
  hourlyCost: optionalMoney,
  dailyCost: optionalMoney,
  drivingLicenses: optionalText(50),
  isActive: z.boolean().default(true),
  userId: optionalId,
  notes: optionalText(2000),
  skillIds: z.array(idSchema).max(50).default([]),
});
export type StaffFormInput = z.input<typeof staffSchema>;

export const skillSchema = z.object({ name: requiredText(100) });

export const unavailabilitySchema = z
  .object({ startAt: z.coerce.date(), endAt: z.coerce.date(), reason: optionalText(200), kind: z.enum(["UNAVAILABLE", "AVAILABLE"]).default("UNAVAILABLE") })
  .refine((v) => v.endAt > v.startAt, { message: "La fin doit être après le début", path: ["endAt"] });

export const staffAssignmentSchema = z
  .object({
    eventId: idSchema,
    staffId: idSchema,
    role: requiredText(100),
    requiredSkillId: optionalId,
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    /** true : mission proposée au prestataire, confirmée seulement après son acceptation */
    propose: z.boolean().default(false),
  })
  .refine((v) => v.endAt > v.startAt, { message: "La fin doit être après le début", path: ["endAt"] });

export const staffAssignmentStatusSchema = z.object({ status: z.enum(["PLANNED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) });

export const timesheetSchema = z.object({
  workDate: z.coerce.date(),
  hours: decimalString(2).refine((v) => Number(v) > 0 && Number(v) <= 24, "Entre 0 et 24 heures"),
  notes: optionalText(500),
});
