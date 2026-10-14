import { apiHandler } from "@/server/api/handler";
import { startRepair } from "@/server/services/maintenance-service";

export const POST = apiHandler({}, ({ ctx, params }) => startRepair(ctx, params.id!));
