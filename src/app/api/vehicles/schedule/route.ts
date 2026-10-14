import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { vehicleSchedule } from "@/server/services/vehicle-service";

export const GET = apiHandler({ query: z.object({ from: z.coerce.date(), to: z.coerce.date() }) }, ({ ctx, query }) => vehicleSchedule(ctx, query.from, query.to));
