import { apiHandler } from "@/server/api/handler";
import { getEventFinancials } from "@/server/services/finance-service";

export const GET = apiHandler({}, ({ ctx, params }) => getEventFinancials(ctx, params.id!));
