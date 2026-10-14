import { apiHandler } from "@/server/api/handler";
import { fileResponse } from "@/server/api/responses";
import { readProductPhoto } from "@/server/services/document-service";

export const GET = apiHandler({}, async ({ ctx, params }) => {
  const photo = await readProductPhoto(ctx, params.id!);
  return fileResponse(photo.data, photo.mimeType, photo.fileName, true);
});
