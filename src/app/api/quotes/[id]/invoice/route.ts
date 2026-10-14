import { apiHandler } from "@/server/api/handler";
import { createInvoiceFromQuote } from "@/server/services/invoice-service";

export const POST = apiHandler({}, ({ ctx, params }) => createInvoiceFromQuote(ctx, params.id!));
