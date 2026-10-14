"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPasswordSchema } from "@/features/auth/schemas";
import { apiFetch, errorMessage } from "@/lib/api-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token, password: "", confirm: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await apiFetch("/api/auth/reset-password", { method: "POST", body: values });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  if (!token) return <Alert tone="danger" title="Lien invalide">Le lien de réinitialisation est incomplet.</Alert>;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Nouveau mot de passe</h1>
      {done ? (
        <>
          <Alert tone="success" title="Mot de passe modifié">Toutes vos sessions ont été fermées. Vous pouvez vous reconnecter.</Alert>
          <Button asChild>
            <Link href="/login">Se connecter</Link>
          </Button>
        </>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Nouveau mot de passe" hint="10 caractères minimum, avec majuscule, minuscule et chiffre" error={form.formState.errors.password?.message} required>
            <Input type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field label="Confirmation" error={form.formState.errors.confirm?.message} required>
            <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
          </Field>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Enregistrer
          </Button>
        </form>
      )}
    </div>
  );
}
