import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { saveScenePlacement } from "@/server/services/scene-service";

const body = z.object({
  kind: z.enum(["STOCK_LOCATION", "VEHICLE", "DOCK", "KPI_SCREEN", "CALENDAR_BOARD", "ALERT_BOARD"]),
  businessId: z.string().min(1).max(60),
  label: z.string().max(100),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotationY: z.number(),
  scale: z.number().default(1),
});

export const PUT = apiHandler({ body }, ({ ctx, body }) => saveScenePlacement(ctx, body));
