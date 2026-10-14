import { z } from "zod";
import { quoteSchema } from "@/features/quotes/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createQuote, listQuotes } from "@/server/services/quote-service";

const query = listQuerySchema.extend({
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]).optional(),
  customerId: z.string().max(50).optional(),
  followUp: z.enum(["true", "false"]).optional(),
});

export const GET = apiHandler({ query }, ({ ctx, query }) => listQuotes(ctx, { ...query, followUp: query.followUp === "true" }));
export const POST = apiHandler({ body: quoteSchema }, ({ ctx, body }) => createQuote(ctx, body));
