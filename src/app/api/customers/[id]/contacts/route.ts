import { contactSchema } from "@/features/customers/schemas";
import { apiHandler } from "@/server/api/handler";
import { addContact } from "@/server/services/customer-service";

export const POST = apiHandler({ body: contactSchema }, ({ ctx, params, body }) => addContact(ctx, params.id!, body));
