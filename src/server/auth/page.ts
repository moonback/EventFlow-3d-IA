import "server-only";
import { notFound, redirect } from "next/navigation";
import { isAppError } from "@/lib/errors";
import type { Permission } from "@/lib/permissions";
import type { AuthContext } from "./context";
import { requirePageAuth } from "./session";

/** Contexte d'une page : authentification + permission(s) requise(s), sinon page « accès refusé ». */
export async function pageContext(...permissions: Permission[]): Promise<AuthContext> {
  const ctx = await requirePageAuth();
  if (permissions.some((p) => !ctx.permissions.has(p))) redirect("/forbidden");
  return ctx;
}

/** Exécute un chargement de page : 404 si la ressource n'existe pas (ou appartient à une autre organisation). */
export async function loadOr404<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound();
    if (isAppError(error) && error.status === 403) redirect("/forbidden");
    throw error;
  }
}
