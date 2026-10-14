import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { saveLayoutChanges } from "@/server/services/scene-service";

const change = z.object({
  kind: z.enum(["STOCK_LOCATION", "VEHICLE", "DOCK", "KPI_SCREEN", "CALENDAR_BOARD", "ALERT_BOARD"]),
  businessId: z.string().min(1).max(60),
  label: z.string().max(100),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotationY: z.number(),
  scale: z.number().default(1),
});
const body = z.object({ label: z.string().trim().min(1).max(120), changes: z.array(change).min(1).max(200) });

/** Enregistre un lot de modifications d'agencement et crée une version de l'agencement. */
export const POST = apiHandler({ body }, ({ ctx, body }) => saveLayoutChanges(ctx, body));
