import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z, ZodType } from "zod";
import { AppError } from "@/lib/errors";
import { resolvePortalToken, type PortalContext } from "../services/staff-portal-token-service";
import { assertSameOrigin, errorResponse } from "./handler";

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

/**
 * Enveloppe des endpoints du portail prestataire : aucune session, aucun AuthContext.
 * Le jeton (en-tête X-Portal-Token, jamais dans l'URL de l'API) limite l'accès à un seul collaborateur.
 */
export function portalHandler<TBody extends ZodType | undefined = undefined, TResult = unknown>(
  options: { body?: TBody },
  fn: (args: { portal: PortalContext; body: Infer<TBody>; params: Record<string, string> }) => Promise<TResult>,
) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      assertSameOrigin(req);
      const portal = await resolvePortalToken(req.headers.get("x-portal-token") ?? "");
      const params = (await context.params) ?? {};
      let body = undefined as Infer<TBody>;
      if (options.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw new AppError("BAD_REQUEST", "Corps de requête JSON invalide", 400);
        }
        body = options.body.parse(raw) as Infer<TBody>;
      }
      const result = await fn({ portal, body, params });
      const res = NextResponse.json({ data: result ?? null });
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (error) {
      return errorResponse(error);
    }
  };
}
