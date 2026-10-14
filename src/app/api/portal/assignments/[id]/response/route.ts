import { proposalResponseSchema } from "@/features/staff-portal/schemas";
import { portalHandler } from "@/server/api/portal-handler";
import { respondToProposal } from "@/server/services/staff-portal-service";

export const POST = portalHandler({ body: proposalResponseSchema }, ({ portal, params, body }) => respondToProposal(portal, params.id!, body));
