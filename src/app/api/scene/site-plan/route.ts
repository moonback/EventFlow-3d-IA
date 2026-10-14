import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { resetSitePlan, saveSitePlan } from "@/server/services/site-plan-service";
import { sitePlanSchema } from "@/features/site-plan/schema";

const body = z.object({ revision: z.number().int().min(0), plan: sitePlanSchema, label: z.string().trim().max(120).optional() });

/** Enregistre le plan du site (409 si la révision a changé entre-temps). */
export const PUT = apiHandler({ body }, ({ ctx, body }) => saveSitePlan(ctx, body));

/** Revient au plan du site par défaut. */
export const DELETE = apiHandler({}, ({ ctx }) => resetSitePlan(ctx));
