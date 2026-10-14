import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { financeOverview } from "@/server/services/finance-service";

export const GET = apiHandler({ query: z.object({ from: z.coerce.date(), to: z.coerce.date() }) }, ({ ctx, query }) => financeOverview(ctx, query.from, query.to));
