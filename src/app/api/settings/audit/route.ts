import { z } from "zod";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { listAuditLog } from "@/server/services/settings-service";

export const GET = apiHandler({ query: listQuerySchema.extend({ entityType: z.string().max(50).optional() }) }, ({ ctx, query }) => listAuditLog(ctx, query));
