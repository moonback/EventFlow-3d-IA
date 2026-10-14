import { apiHandler } from "@/server/api/handler";
import { availableReports } from "@/server/services/report-service";

export const GET = apiHandler({ permissions: ["reports:read"] }, async ({ ctx }) => availableReports(ctx));
