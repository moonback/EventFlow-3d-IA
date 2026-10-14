import { paymentSchema } from "@/features/invoices/schemas";
import { apiHandler } from "@/server/api/handler";
import { recordPayment } from "@/server/services/invoice-service";

export const POST = apiHandler({ body: paymentSchema }, ({ ctx, body }) => recordPayment(ctx, body));
