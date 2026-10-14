import { skillSchema } from "@/features/staff/schemas";
import { apiHandler } from "@/server/api/handler";
import { createSkill, listSkills } from "@/server/services/staff-service";

export const GET = apiHandler({}, ({ ctx }) => listSkills(ctx));
export const POST = apiHandler({ body: skillSchema }, ({ ctx, body }) => createSkill(ctx, body));
