import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { findProductLocations } from "@/server/services/inventory-service";

export const GET = apiHandler({ query: z.object({ q: z.string().trim().min(1).max(100) }) }, ({ ctx, query }) => findProductLocations(ctx, query.q));
