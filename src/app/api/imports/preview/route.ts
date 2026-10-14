import { ValidationError } from "@/lib/errors";
import { apiHandler } from "@/server/api/handler";
import { IMPORT_KINDS, previewImport, type ImportKind } from "@/server/services/import-service";

/** Aperçu d'import (multipart : file + kind). Aucune donnée métier n'est modifiée. */
export const POST = apiHandler({}, async ({ ctx, req }) => {
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  if (!(IMPORT_KINDS as readonly string[]).includes(kind)) throw new ValidationError("Type d'import inconnu");
  if (!(file instanceof File)) throw new ValidationError("Fichier manquant");
  if (file.size > 5 * 1024 * 1024) throw new ValidationError("Fichier CSV limité à 5 Mo");
  if (!/\.(csv|txt)$/i.test(file.name)) throw new ValidationError("Format attendu : CSV");
  const text = await file.text();
  return previewImport(ctx, kind as ImportKind, file.name, text);
});
