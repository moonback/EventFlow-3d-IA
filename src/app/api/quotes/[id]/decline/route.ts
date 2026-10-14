import { apiHandler } from "@/server/api/handler";
import { setQuoteStatus } from "@/server/services/quote-service";

export const POST = apiHandler({}, ({ ctx, params }) => setQuoteStatus(ctx, params.id!, "DECLINED"));
