import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { staffSchedule } from "@/server/services/staff-service";

export const GET = apiHandler({ query: z.object({ from: z.coerce.date(), to: z.coerce.date() }) }, ({ ctx, query }) => staffSchedule(ctx, query.from, query.to));
