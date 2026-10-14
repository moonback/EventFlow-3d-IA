import { apiHandler } from "@/server/api/handler";
import { listLayoutVersions } from "@/server/services/scene-service";

export const GET = apiHandler({}, ({ ctx }) => listLayoutVersions(ctx));
