import { apiHandler } from "@/server/api/handler";
import { reviseQuote } from "@/server/services/quote-service";

export const POST = apiHandler({}, ({ ctx, params }) => reviseQuote(ctx, params.id!));
