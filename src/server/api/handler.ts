import "server-only";
import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { env } from "@/lib/env";
import { AppError, ForbiddenError, isAppError } from "@/lib/errors";
import type { Permission } from "@/lib/permissions";
import { assertCan, type AuthContext } from "../auth/context";
import { requireAuth } from "../auth/session";

type RouteParams = Record<string, string>;

interface HandlerOptions<TBody extends ZodType | undefined, TQuery extends ZodType | undefined> {
  /** Permissions requises (vérifiées en plus des contrôles internes aux services) */
  permissions?: Permission[];
  body?: TBody;
  query?: TQuery;
}

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

interface HandlerArgs<TBody, TQuery> {
  ctx: AuthContext;
  body: TBody;
  query: TQuery;
  params: RouteParams;
  req: NextRequest;
}

/** Réponse JSON standard en cas d'erreur — jamais de trace interne exposée. */
export function errorResponse(error: unknown): NextResponse {
  if (isAppError(error)) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details ?? null } },
      { status: error.status },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Données invalides",
          details: { fieldErrors: z.flattenError(error).fieldErrors },
        },
      },
      { status: 422 },
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: { code: "DUPLICATE", message: "Cette valeur existe déjà (doublon)", details: null } },
        { status: 409 },
      );
    }
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Ressource introuvable", details: null } },
        { status: 404 },
      );
    }
  }
  console.error("[api] unexpected error", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Erreur interne, réessayez ou contactez un administrateur", details: null } },
    { status: 500 },
  );
}

/**
 * Protection CSRF : les requêtes modifiant des données doivent provenir de la même origine.
 * (Cookie SameSite=Lax + vérification de l'en-tête Origin.)
 */
export function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // requêtes non-navigateur (tests, scripts) : protégées par l'absence de cookie tiers
  const allowed = new Set([new URL(env().APP_URL).origin, req.nextUrl.origin]);
  if (!allowed.has(origin)) throw new ForbiddenError("Origine de la requête refusée");
}

/**
 * Enveloppe standard des endpoints : authentification → organisation (issue de la session)
 * → permissions → validation Zod → service métier → réponse typée / erreurs propres.
 */
export function apiHandler<TBody extends ZodType | undefined = undefined, TQuery extends ZodType | undefined = undefined, TResult = unknown>(
  options: HandlerOptions<TBody, TQuery>,
  fn: (args: HandlerArgs<Infer<TBody>, Infer<TQuery>>) => Promise<TResult>,
) {
  return async (req: NextRequest, context: { params: Promise<RouteParams> }) => {
    try {
      assertSameOrigin(req);
      const ctx = await requireAuth();
      if (options.permissions?.length) assertCan(ctx, ...options.permissions);
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
      let query = undefined as Infer<TQuery>;
      if (options.query) {
        query = options.query.parse(Object.fromEntries(req.nextUrl.searchParams.entries())) as Infer<TQuery>;
      }
      const result = await fn({ ctx, body, query, params, req });
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
