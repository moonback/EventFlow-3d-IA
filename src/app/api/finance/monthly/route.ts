import { apiHandler } from "@/server/api/handler";
import { monthlySeries } from "@/server/services/finance-service";

export const GET = apiHandler({}, ({ ctx }) => monthlySeries(ctx));
