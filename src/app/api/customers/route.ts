import { z } from "zod";
import { customerSchema } from "@/features/customers/schemas";
import { listQuerySchema } from "@/lib/pagination";
import { apiHandler } from "@/server/api/handler";
import { createCustomer, listCustomers } from "@/server/services/customer-service";

const query = listQuerySchema.extend({ kind: z.enum(["INDIVIDUAL", "COMPANY"]).optional(), archived: z.enum(["true", "false"]).optional() });

export const GET = apiHandler({ query }, ({ ctx, query }) => listCustomers(ctx, { ...query, archived: query.archived === "true" }));
export const POST = apiHandler({ body: customerSchema }, ({ ctx, body }) => createCustomer(ctx, body));
