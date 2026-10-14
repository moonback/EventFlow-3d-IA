import { invitationSchema } from "@/features/settings/schemas";
import { apiHandler } from "@/server/api/handler";
import { createInvitation } from "@/server/services/auth-service";

/** Le lien n'est renvoyé que si l'e-mail n'a pas pu être remis (à transmettre manuellement). */
export const POST = apiHandler({ body: invitationSchema }, async ({ ctx, body }) => {
  const result = await createInvitation(ctx, body.email, body.role);
  const delivered = result.mail.status === "sent" || result.mail.status === "stored";
  return { id: result.id, mailStatus: result.mail.status, link: delivered ? null : result.link };
});
