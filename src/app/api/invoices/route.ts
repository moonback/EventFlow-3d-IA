import { z } from "zod";
import { invoiceSchema } from "@/features/invoices/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createInvoice, listInvoices } from "@/server/services/invoice-service";

const query = listQuerySchema.extend({
  status: z.enum(["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"]).optional(),
  kind: z.enum(["INVOICE", "CREDIT_NOTE"]).optional(),
  customerId: z.string().max(50).optional(),
  overdue: z.enum(["true", "false"]).optional(),
});

export const GET = apiHandler({ query }, ({ ctx, query }) => listInvoices(ctx, { ...query, overdue: query.overdue === "true" }));
export const POST = apiHandler({ body: invoiceSchema }, ({ ctx, body }) => createInvoice(ctx, body));
