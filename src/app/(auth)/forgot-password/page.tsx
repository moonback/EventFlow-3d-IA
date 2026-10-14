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
import { forgotPasswordSchema } from "@/features/auth/schemas";
import { apiFetch, errorMessage } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await apiFetch("/api/auth/forgot-password", { method: "POST", body: values });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground">Un lien de réinitialisation valable 1 heure vous sera envoyé.</p>
      </div>
      {done ? (
        <Alert tone="success" title="Demande enregistrée">
          Si un compte correspond à cette adresse, un e-mail contenant un lien de réinitialisation vient d&apos;être émis.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Adresse e-mail" error={form.formState.errors.email?.message} required>
            <Input type="email" autoComplete="email" {...form.register("email")} />
          </Field>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Envoyer le lien
          </Button>
        </form>
      )}
      <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
        Retour à la connexion
      </Link>
    </div>
  );
}
