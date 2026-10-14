import { z } from "zod";
import { expenseSchema } from "@/features/invoices/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createExpense, listExpenses } from "@/server/services/invoice-service";

const query = listQuerySchema.extend({ eventId: z.string().max(50).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });

export const GET = apiHandler({ query }, ({ ctx, query }) => listExpenses(ctx, query));
export const POST = apiHandler({ body: expenseSchema }, ({ ctx, body }) => createExpense(ctx, body));
