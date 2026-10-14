import { z } from "zod";
import { optionalEmail, optionalPhone, optionalText, requiredText } from "@/lib/zod-helpers";

export const customerSchema = z
  .object({
    kind: z.enum(["INDIVIDUAL", "COMPANY"]),
    name: optionalText(200),
    firstName: optionalText(100),
    lastName: optionalText(100),
    email: optionalEmail,
    phone: optionalPhone,
    siret: optionalText(20).refine((v) => v === null || /^\d{14}$/.test(v.replace(/\s/g, "")), "SIRET : 14 chiffres"),
    vatNumber: optionalText(20),
    notes: optionalText(5000),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "COMPANY" && !v.name) ctx.addIssue({ code: "custom", path: ["name"], message: "Raison sociale obligatoire" });
    if (v.kind === "INDIVIDUAL" && (!v.firstName || !v.lastName)) {
      ctx.addIssue({ code: "custom", path: ["lastName"], message: "Prénom et nom obligatoires" });
    }
  });
export type CustomerInput = z.input<typeof customerSchema>;

export const contactSchema = z.object({
  firstName: requiredText(100),
  lastName: requiredText(100),
  jobTitle: optionalText(100),
  email: optionalEmail,
  phone: optionalPhone,
  isPrimary: z.boolean().default(false),
});

export const addressSchema = z.object({
  kind: z.enum(["BILLING", "EVENT", "OTHER"]),
  label: optionalText(100),
  line1: requiredText(200),
  line2: optionalText(200),
  postalCode: requiredText(12),
  city: requiredText(100),
  country: z.string().trim().length(2).default("FR"),
  isDefault: z.boolean().default(false),
});

export const customerListFilters = z.object({
  kind: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
  archived: z.enum(["true", "false"]).optional(),
});
