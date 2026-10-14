import { z } from "zod";
import { manualMovementSchema } from "@/features/inventory/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { listMovements, recordManualMovement } from "@/server/services/stock-movement-service";

const query = listQuerySchema.extend({
  productId: z.string().max(50).optional(),
  locationId: z.string().max(50).optional(),
  reservationId: z.string().max(50).optional(),
  type: z.enum(["RECEIPT", "TRANSFER", "PREPARATION", "UNPREPARE", "SHIPMENT", "RETURN", "RETURN_DAMAGED", "MAINTENANCE_IN", "MAINTENANCE_OUT", "LOSS", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "REVERSAL"]).optional(),
});

export const GET = apiHandler({ query }, ({ ctx, query }) => listMovements(ctx, query));
/** Mouvements manuels uniquement (réception hors commande, transfert, ajustement, perte). */
export const POST = apiHandler({ body: manualMovementSchema }, ({ ctx, body }) => recordManualMovement(ctx, body));
