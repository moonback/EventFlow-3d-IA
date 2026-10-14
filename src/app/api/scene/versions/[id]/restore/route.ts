import { apiHandler } from "@/server/api/handler";
import { restoreLayoutVersion } from "@/server/services/scene-service";

export const POST = apiHandler({}, ({ ctx, params }) => restoreLayoutVersion(ctx, params.id!));
