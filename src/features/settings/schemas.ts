import { z } from "zod";
import { decimalString, optionalEmail, optionalPhone, optionalText, requiredText, timezone } from "@/lib/zod-helpers";

export const organizationSettingsSchema = z.object({
  name: requiredText(120),
  legalName: optionalText(200),
  siret: optionalText(20),
  vatNumber: optionalText(20),
  email: optionalEmail,
  phone: optionalPhone,
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  postalCode: optionalText(12),
  city: optionalText(100),
  country: z.string().trim().length(2).default("FR"),
  timezone,
  defaultVatRate: decimalString(2).refine((v) => Number(v) >= 0 && Number(v) <= 100, "Entre 0 et 100"),
  paymentTermDays: z.coerce.number().int().min(0).max(120),
  prepBufferHours: z.coerce.number().int().min(0).max(720),
  returnBufferHours: z.coerce.number().int().min(0).max(720),
  quoteValidityDays: z.coerce.number().int().min(1).max(365),
  quoteFooter: optionalText(2000),
  invoiceFooter: optionalText(2000),
  latePenaltyText: optionalText(2000),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type OrganizationSettingsInput = z.input<typeof organizationSettingsSchema>;

export const rolePermissionSchema = z.object({
  role: z.enum(["ADMIN", "DIRECTOR", "LOGISTICS_MANAGER", "STOCK_MANAGER", "SALES", "ACCOUNTING", "TECHNICIAN", "DRIVER", "CREW", "READ_ONLY"]),
  permission: z.string().max(50),
  /** null = revenir à la valeur par défaut */
  granted: z.boolean().nullable(),
});

export const memberUpdateSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "DIRECTOR", "LOGISTICS_MANAGER", "STOCK_MANAGER", "SALES", "ACCOUNTING", "TECHNICIAN", "DRIVER", "CREW", "READ_ONLY"]),
  isActive: z.boolean().optional(),
});

export const invitationSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  role: memberUpdateSchema.shape.role,
});

export const notificationPrefsSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.enum(["RESERVATION_CONFIRMED", "STOCK_INSUFFICIENT", "PREPARATION_INCOMPLETE", "DEPARTURE_SOON", "RETURN_LATE", "EQUIPMENT_DAMAGED", "MAINTENANCE_DUE", "QUOTE_FOLLOW_UP", "INVOICE_OVERDUE", "TASK_OVERDUE", "LOW_STOCK", "STAFF_MISSION_RESPONSE", "QUOTE_REQUEST", "GENERAL"]),
        inApp: z.boolean(),
        email: z.boolean(),
      }),
    )
    .max(20),
});
