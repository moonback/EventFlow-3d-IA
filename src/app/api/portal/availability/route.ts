import { portalAvailabilitySchema } from "@/features/staff-portal/schemas";
import { portalHandler } from "@/server/api/portal-handler";
import { declareAvailability } from "@/server/services/staff-portal-service";

export const POST = portalHandler({ body: portalAvailabilitySchema }, ({ portal, body }) => declareAvailability(portal, body));
