/** Détection WebGL (le monde 3D n'est chargé que si le navigateur le supporte). */
export function detectWebGL(): { supported: boolean; reason?: string } {
  if (typeof window === "undefined") return { supported: false, reason: "Rendu serveur" };
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { supported: false, reason: "WebGL indisponible sur ce navigateur ou cet appareil" };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { supported: true };
  } catch {
    return { supported: false, reason: "Initialisation WebGL impossible" };
  }
}
