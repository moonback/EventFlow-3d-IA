import { NotFoundError } from "@/lib/errors";
import { apiHandler } from "@/server/api/handler";
import { fileResponse } from "@/server/api/responses";
import { renderReservationSheet } from "@/server/pdf/documents";

const NAMES = { picking: "bon-preparation", delivery: "bon-livraison", return: "fiche-retour" } as const;

/** Bons logistiques PDF (aperçu inline ou téléchargement). */
export const GET = apiHandler({}, async ({ ctx, params, req }) => {
  const type = params.type as keyof typeof NAMES;
  if (!(type in NAMES)) throw new NotFoundError("Document");
  const pdf = await renderReservationSheet(ctx, params.id!, type);
  return fileResponse(pdf, "application/pdf", `${NAMES[type]}-${params.id}.pdf`, req.nextUrl.searchParams.get("inline") === "1");
});
