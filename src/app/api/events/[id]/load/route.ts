import { apiHandler } from "@/server/api/handler";
import { getEventLoad } from "@/server/services/vehicle-service";

export const GET = apiHandler({}, ({ ctx, params }) => getEventLoad(ctx, params.id!));
