"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";

/**
 * Soumission d'un formulaire vers l'API : les erreurs de validation serveur sont reportées
 * champ par champ, les erreurs métier affichées en notification.
 */
export function useApiSubmit<TForm extends FieldValues, TResult = unknown>(setError: UseFormSetError<TForm>) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  async function submit(
    url: string,
    method: "POST" | "PUT" | "PATCH",
    body: unknown,
    opts: { success?: string; redirect?: (result: TResult) => string | null; refresh?: boolean } = {},
  ): Promise<TResult | null> {
    setFormError(null);
    try {
      const result = await apiFetch<TResult>(url, { method, body });
      if (opts.success) toast.success(opts.success);
      const to = opts.redirect?.(result);
      if (to) router.push(to);
      if (opts.refresh !== false) router.refresh();
      return result;
    } catch (error) {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors;
        for (const [name, messages] of Object.entries(fields)) {
          if (messages?.[0]) setError(name as Path<TForm>, { message: messages[0] });
        }
      }
      const message = errorMessage(error);
      setFormError(message);
      toast.error(message);
      return null;
    }
  }
  return { submit, formError };
}
