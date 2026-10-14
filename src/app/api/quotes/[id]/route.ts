import { quoteSchema } from "@/features/quotes/schemas";
import { apiHandler } from "@/server/api/handler";
import { getQuote, updateQuote } from "@/server/services/quote-service";

export const GET = apiHandler({}, ({ ctx, params }) => getQuote(ctx, params.id!));
export const PUT = apiHandler({ body: quoteSchema }, ({ ctx, params, body }) => updateQuote(ctx, params.id!, body));
