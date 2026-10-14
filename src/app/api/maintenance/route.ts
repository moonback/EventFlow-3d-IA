import { z } from "zod";
import { maintenanceCreateSchema } from "@/features/maintenance/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createMaintenanceTicket, listMaintenance } from "@/server/services/maintenance-service";

const query = listQuerySchema.extend({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "SCRAPPED"]).optional(), open: z.enum(["true", "false"]).optional() });

export const GET = apiHandler({ query }, ({ ctx, query }) => listMaintenance(ctx, { ...query, open: query.open === "true" }));
export const POST = apiHandler({ body: maintenanceCreateSchema }, ({ ctx, body }) => createMaintenanceTicket(ctx, body));
