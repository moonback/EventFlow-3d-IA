import { apiHandler } from "@/server/api/handler";
import { getDashboard } from "@/server/services/dashboard-service";

export const GET = apiHandler({}, ({ ctx }) => getDashboard(ctx));
