import { apiHandler } from "@/server/api/handler";
import { deleteBookmark } from "@/server/services/scene-service";

export const DELETE = apiHandler({}, ({ ctx, params }) => deleteBookmark(ctx, params.id!));
