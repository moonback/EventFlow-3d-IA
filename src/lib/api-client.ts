/** Client HTTP du navigateur vers les routes API (aucune logique métier ici). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown,
  ) {
    super(message);
  }
  get fieldErrors(): Record<string, string[]> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | null;
    return d?.fieldErrors ?? {};
  }
}

export async function apiFetch<T = unknown>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await fetch(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? (isForm ? (init.body as FormData) : JSON.stringify(init.body)) : undefined,
    signal: init.signal,
    credentials: "same-origin",
  });
  let payload: { data?: T; error?: { code: string; message: string; details: unknown } } = {};
  try {
    payload = await res.json();
  } catch {
    /* réponse non JSON */
  }
  if (!res.ok || payload.error) {
    if (res.status === 401 && typeof window !== "undefined" && !url.includes("/api/auth/")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(res.status, payload.error?.code ?? "HTTP_ERROR", payload.error?.message ?? `Erreur ${res.status}`, payload.error?.details ?? null);
  }
  return payload.data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Une erreur est survenue";
}
