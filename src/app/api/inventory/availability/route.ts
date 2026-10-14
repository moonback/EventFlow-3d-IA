import { availabilityQuerySchema } from "@/features/reservations/schemas";
import { ValidationError } from "@/lib/errors";
import { apiHandler } from "@/server/api/handler";
import { checkAvailability } from "@/server/services/availability-service";

/** GET /api/inventory/availability?productIds=a,b&startAt=ISO&endAt=ISO */
export const GET = apiHandler({ query: availabilityQuerySchema }, ({ ctx, query }) => {
  if (query.endAt <= query.startAt) throw new ValidationError("La fin doit être postérieure au début");
  return checkAvailability(ctx, query);
});
