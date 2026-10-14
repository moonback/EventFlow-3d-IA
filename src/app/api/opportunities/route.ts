import { opportunityListQuerySchema } from "@/features/opportunities/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { listOpportunities } from "@/server/services/opportunity-service";

const query = listQuerySchema.extend(opportunityListQuerySchema.shape);

export const GET = apiHandler({ query, permissions: ["quotes:read"] }, ({ ctx, query }) => listOpportunities(ctx, query));
