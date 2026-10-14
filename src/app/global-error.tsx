"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui", background: "#16171d", color: "#eee", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h1>Une erreur inattendue est survenue</h1>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px" }}>
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
