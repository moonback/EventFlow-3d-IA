import { apiHandler } from "@/server/api/handler";
import { getScene } from "@/server/services/scene-service";

export const GET = apiHandler({}, ({ ctx }) => getScene(ctx));
