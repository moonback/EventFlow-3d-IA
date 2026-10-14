import { apiHandler } from "@/server/api/handler";
import { renderQuotePdf } from "@/server/pdf/documents";
import { sendQuoteByEmail } from "@/server/services/quote-service";

/** Envoi par e-mail — uniquement sur action explicite de l'utilisateur. */
export const POST = apiHandler({}, ({ ctx, params }) => sendQuoteByEmail(ctx, params.id!, renderQuotePdf));
