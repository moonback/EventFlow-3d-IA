import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { apiHandler } from "@/server/api/handler";
import { listDocuments, uploadDocument } from "@/server/services/document-service";

const meta = z.object({
  target: z.enum(["customer", "event", "vehicle", "staff", "product-photo"]),
  targetId: z.string().min(1).max(50),
  category: z.enum(["CONTRACT", "QUOTE", "INVOICE", "PHOTO", "PLAN", "TECHNICAL", "VEHICLE", "STAFF", "OTHER"]).optional(),
});

export const GET = apiHandler({ query: z.object({ q: z.string().max(100).optional() }) }, ({ ctx, query }) => listDocuments(ctx, { q: query.q }));

/** Téléversement multipart (file + target + targetId [+ category]). */
export const POST = apiHandler({}, async ({ ctx, req }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("Fichier manquant");
  const parsed = meta.parse({ target: form.get("target"), targetId: form.get("targetId"), category: form.get("category") || undefined });
  const data = Buffer.from(await file.arrayBuffer());
  return uploadDocument(ctx, { ...parsed, fileName: file.name, data });
});
