import { apiHandler } from "@/server/api/handler";
import { applyImport } from "@/server/services/import-service";

export const POST = apiHandler({}, ({ ctx, params }) => applyImport(ctx, params.id!));
