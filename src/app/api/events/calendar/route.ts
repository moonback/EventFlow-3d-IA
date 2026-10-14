import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { apiHandler } from "@/server/api/handler";
import { calendarEvents } from "@/server/services/event-service";

const query = z.object({ from: z.coerce.date(), to: z.coerce.date() });

export const GET = apiHandler({ query }, ({ ctx, query }) => {
  if (query.to.getTime() - query.from.getTime() > 400 * 86_400_000) throw new ValidationError("Période limitée à 400 jours");
  return calendarEvents(ctx, query.from, query.to);
});
