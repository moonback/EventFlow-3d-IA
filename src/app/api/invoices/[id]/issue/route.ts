import { apiHandler } from "@/server/api/handler";
import { issueInvoice } from "@/server/services/invoice-service";

export const POST = apiHandler({}, ({ ctx, params }) => issueInvoice(ctx, params.id!));
