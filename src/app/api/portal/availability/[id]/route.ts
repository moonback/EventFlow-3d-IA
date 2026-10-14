import { portalHandler } from "@/server/api/portal-handler";
import { deletePortalAvailability } from "@/server/services/staff-portal-service";

export const DELETE = portalHandler({}, ({ portal, params }) => deletePortalAvailability(portal, params.id!));
