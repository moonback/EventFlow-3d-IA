import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { updatePresence } from "@/server/services/scene-service";

const vec = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const body = z.object({
  page: z.string().min(1).max(40),
  camera: z.object({ position: vec, target: vec, walking: z.boolean().default(false) }).nullable(),
  selectedKey: z.string().max(120).nullable().default(null),
  leave: z.boolean().optional(),
});

/** Présence dans le monde 3D : enregistre mon point de vue, renvoie celui des collègues connectés. */
export const POST = apiHandler({ body }, ({ ctx, body }) => updatePresence(ctx, body));
