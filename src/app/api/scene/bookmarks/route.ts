import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { createBookmark, listBookmarks } from "@/server/services/scene-service";

const vec = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const body = z.object({ name: z.string().trim().min(1, "Nom obligatoire").max(60), position: vec, target: vec });

/** Points de vue enregistrés du monde 3D (partagés avec l'organisation). */
export const GET = apiHandler({}, ({ ctx }) => listBookmarks(ctx));
export const POST = apiHandler({ body }, ({ ctx, body }) => createBookmark(ctx, body));
