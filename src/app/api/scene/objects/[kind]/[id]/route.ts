import { apiHandler } from "@/server/api/handler";
import { getScenePanel } from "@/server/services/scene-service";

/** Panneau contextuel d'un objet 3D : type + identifiant métier explicites. */
export const GET = apiHandler({}, ({ ctx, params }) => getScenePanel(ctx, params.kind!, params.id!));
