import { opportunityUpdateSchema } from "@/features/opportunities/schemas";
import { apiHandler } from "@/server/api/handler";
import { getOpportunity, updateOpportunity } from "@/server/services/opportunity-service";

export const GET = apiHandler({ permissions: ["quotes:read"] }, ({ ctx, params }) => getOpportunity(ctx, params.id!));
export const PATCH = apiHandler({ body: opportunityUpdateSchema, permissions: ["quotes:write"] }, ({ ctx, params, body }) => updateOpportunity(ctx, params.id!, body));
