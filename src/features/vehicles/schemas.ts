import { z } from "zod";
import { idSchema, optionalDate, optionalDecimal, optionalId, optionalInt, optionalMoney, optionalText, requiredText } from "@/lib/zod-helpers";

export const VEHICLE_TYPES = ["VAN", "TRUCK_LIGHT", "TRUCK_HEAVY", "TRAILER", "CAR"] as const;

export const vehicleSchema = z.object({
  registration: z.string().trim().toUpperCase().min(4).max(15).regex(/^[A-Z0-9-]+$/, "Immatriculation invalide (ex. AB-123-CD)"),
  brand: requiredText(60),
  model: requiredText(60),
  type: z.enum(VEHICLE_TYPES),
  status: z.enum(["AVAILABLE", "MAINTENANCE", "UNAVAILABLE", "RETIRED"]).default("AVAILABLE"),
  payloadKg: optionalInt,
  volumeM3: optionalDecimal(2),
  mileageKm: z.coerce.number().int().min(0).max(5_000_000).default(0),
  requiredLicense: optionalText(10),
  insuranceExpiresAt: optionalDate,
  inspectionDueAt: optionalDate,
  nextServiceAt: optionalDate,
  nextServiceKm: optionalInt,
  dailyCost: optionalMoney,
  costPerKm: optionalDecimal(3),
  notes: optionalText(2000),
});
export type VehicleFormInput = z.input<typeof vehicleSchema>;

export const vehicleAssignmentSchema = z
  .object({
    vehicleId: idSchema,
    eventId: idSchema,
    driverId: optionalId,
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    purpose: optionalText(200),
    loadWeightKg: optionalDecimal(2),
    loadVolumeM3: optionalDecimal(3),
    distanceKm: optionalInt,
  })
  .refine((v) => v.endAt > v.startAt, { message: "La fin doit être après le début", path: ["endAt"] });

export const vehicleAssignmentStatusSchema = z.object({ status: z.enum(["PLANNED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) });

export const vehicleMaintenanceSchema = z.object({
  title: requiredText(200),
  scheduledAt: z.coerce.date(),
  completedAt: optionalDate,
  mileageKm: optionalInt,
  cost: optionalMoney,
  notes: optionalText(2000),
  blocksVehicle: z.boolean().default(true),
});
