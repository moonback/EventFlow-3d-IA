import { quoteAcceptSchema } from "@/features/quotes/schemas";
import { apiHandler } from "@/server/api/handler";
import { acceptQuote } from "@/server/services/quote-service";

export const POST = apiHandler({ body: quoteAcceptSchema }, ({ ctx, params, body }) => acceptQuote(ctx, params.id!, body));
