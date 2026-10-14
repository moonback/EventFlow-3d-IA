import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * En-têtes de sécurité. La CSP autorise 'unsafe-inline' pour les scripts car Next.js injecte des
 * scripts d'hydratation inline (une CSP à nonce est possible via le middleware si nécessaire),
 * et 'unsafe-eval' uniquement en développement (Fast Refresh). 'wasm-unsafe-eval' autorise seulement
 * la compilation WebAssembly (décodeur Meshopt des modèles 3D, embarqué) sans autoriser eval() en JavaScript.
 */
const cspDirectives = (frameAncestors: string) => [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  `frame-ancestors ${frameAncestors}`,
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
const csp = cspDirectives("'none'");

const commonHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

/** Pages : aucune intégration dans un cadre tiers. */
const pageHeaders = [...commonHeaders, { key: "Content-Security-Policy", value: csp }, { key: "X-Frame-Options", value: "DENY" }];

/**
 * Formulaire public de demande de devis : intégrable en iframe sur le site de l'agence (n'importe
 * quelle origine). La page n'utilise aucune session : un cadrage tiers n'expose rien de privé.
 */
const embeddablePageHeaders = [...commonHeaders, { key: "Content-Security-Policy", value: cspDirectives("*") }];

/** API : réponses JSON/fichiers ; les PDF peuvent être prévisualisés dans un cadre de la même origine. */
const apiHeaders = [
  ...commonHeaders,
  { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Cache-Control", value: "private, no-store" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Modules natifs / lisant leurs fichiers de données : exécutés tels quels côté serveur
  serverExternalPackages: ["pdfkit", "@node-rs/argon2", "@aws-sdk/client-s3"],
  typedRoutes: false,
  async headers() {
    return [
      { source: "/((?!api/|demande/).*)", headers: pageHeaders },
      { source: "/demande/:path*", headers: embeddablePageHeaders },
      { source: "/api/:path*", headers: apiHeaders },
    ];
  },
};

export default nextConfig;
