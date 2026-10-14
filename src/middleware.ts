import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/accept-invitation", "/portal", "/demande/"];

/**
 * Filtrage rapide : sans cookie de session, les pages privées redirigent vers /login.
 * La validation réelle de la session (base de données) est faite côté serveur à chaque
 * rendu et à chaque appel d'API — ce middleware n'est pas une mesure de sécurité suffisante seule.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get("ef_session")?.value);
  // Page d'accueil publique : correspondance exacte ("/" préfixe toutes les routes)
  if (pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|models|textures|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
