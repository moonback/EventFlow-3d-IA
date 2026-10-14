import { apiHandler } from "@/server/api/handler";
import { listMembers } from "@/server/services/auth-service";

export const GET = apiHandler({}, ({ ctx }) => listMembers(ctx));
