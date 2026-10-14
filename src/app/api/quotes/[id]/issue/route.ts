import { apiHandler } from "@/server/api/handler";
import { issueQuote } from "@/server/services/quote-service";

export const POST = apiHandler({}, ({ ctx, params }) => issueQuote(ctx, params.id!));
