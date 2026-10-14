import { apiHandler } from "@/server/api/handler";
import { fileResponse } from "@/server/api/responses";
import { readDocument } from "@/server/services/document-service";

/** Téléchargement authentifié : organisation + permissions vérifiées à chaque requête. */
export const GET = apiHandler({}, async ({ ctx, params, req }) => {
  const doc = await readDocument(ctx, params.id!);
  const inline = req.nextUrl.searchParams.get("inline") === "1" && (doc.mimeType.startsWith("image/") || doc.mimeType === "application/pdf");
  return fileResponse(doc.data, doc.mimeType, doc.fileName, inline);
});
