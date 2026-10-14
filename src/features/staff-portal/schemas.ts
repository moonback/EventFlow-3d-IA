import { z } from "zod";
import { optionalText } from "@/lib/zod-helpers";

export const proposalResponseSchema = z.object({
  decision: z.enum(["ACCEPT", "DECLINE"]),
  reason: optionalText(500),
});

export const portalAvailabilitySchema = z
  .object({
    kind: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    reason: optionalText(200),
  })
  .refine((v) => v.endAt > v.startAt, { message: "La fin doit être après le début", path: ["endAt"] })
  .refine((v) => v.endAt.getTime() - v.startAt.getTime() <= 366 * 86_400_000, { message: "Période limitée à un an", path: ["endAt"] });
