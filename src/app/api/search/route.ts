import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { globalSearch } from "@/server/services/search-service";

export const GET = apiHandler({ query: z.object({ q: z.string().trim().min(2).max(100) }) }, ({ ctx, query }) => globalSearch(ctx, query.q));
