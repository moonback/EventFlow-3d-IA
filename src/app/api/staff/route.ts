import { z } from "zod";
import { staffSchema } from "@/features/staff/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createStaffMember, listStaff } from "@/server/services/staff-service";

const query = listQuerySchema.extend({ active: z.enum(["true", "false"]).optional(), skillId: z.string().max(50).optional() });

export const GET = apiHandler({ query }, ({ ctx, query }) => listStaff(ctx, { ...query, active: query.active === undefined ? undefined : query.active === "true" }));
export const POST = apiHandler({ body: staffSchema }, ({ ctx, body }) => createStaffMember(ctx, body));
