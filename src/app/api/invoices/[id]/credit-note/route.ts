import { creditNoteSchema } from "@/features/invoices/schemas";
import { apiHandler } from "@/server/api/handler";
import { createCreditNote } from "@/server/services/invoice-service";

export const POST = apiHandler({ body: creditNoteSchema }, ({ ctx, params, body }) => createCreditNote(ctx, params.id!, body));
