import { portalHandler } from "@/server/api/portal-handler";
import { getPortalOverview } from "@/server/services/staff-portal-service";

export const GET = portalHandler({}, ({ portal }) => getPortalOverview(portal));
