import { apiHandler } from "@/server/api/handler";
import { issuePortalToken, revokePortalTokens } from "@/server/services/staff-portal-token-service";

export const POST = apiHandler({}, ({ ctx, params }) => issuePortalToken(ctx, params.id!));
export const DELETE = apiHandler({}, ({ ctx, params }) => revokePortalTokens(ctx, params.id!));
