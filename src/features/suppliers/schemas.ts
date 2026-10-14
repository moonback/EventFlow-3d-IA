import { z } from "zod";
import { optionalEmail, optionalPhone, optionalText, requiredText } from "@/lib/zod-helpers";

export const supplierSchema = z.object({
  name: requiredText(200),
  email: optionalEmail,
  phone: optionalPhone,
  website: optionalText(200),
  addressLine1: optionalText(200),
  postalCode: optionalText(12),
  city: optionalText(100),
  country: z.string().trim().length(2).default("FR"),
  siret: optionalText(20),
  vatNumber: optionalText(20),
  notes: optionalText(5000),
});
export type SupplierInput = z.input<typeof supplierSchema>;

export const supplierContactSchema = z.object({
  firstName: requiredText(100),
  lastName: requiredText(100),
  jobTitle: optionalText(100),
  email: optionalEmail,
  phone: optionalPhone,
});
