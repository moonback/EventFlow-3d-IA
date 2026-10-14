import "server-only";

/** Réponse fichier (PDF, CSV…) — jamais mise en cache partagé. */
export function fileResponse(data: Buffer | string, mimeType: string, fileName: string, inline = false) {
  const body = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const safe = fileName.replace(/[^\w.\- ]+/g, "_");
  return new Response(body, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
