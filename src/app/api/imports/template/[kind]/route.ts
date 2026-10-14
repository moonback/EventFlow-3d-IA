import { NotFoundError } from "@/lib/errors";
import { apiHandler } from "@/server/api/handler";
import { fileResponse } from "@/server/api/responses";
import { IMPORT_KINDS, importTemplateCsv, type ImportKind } from "@/server/services/import-service";

export const GET = apiHandler({ permissions: ["import:run"] }, async ({ params }) => {
  if (!(IMPORT_KINDS as readonly string[]).includes(params.kind!)) throw new NotFoundError("Modèle");
  return fileResponse(importTemplateCsv(params.kind as ImportKind), "text/csv; charset=utf-8", `modele-${params.kind}.csv`);
});
