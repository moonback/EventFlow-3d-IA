"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field } from "@/components/forms/field";
import { Alert } from "@/components/feedback/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginSchema } from "@/features/auth/schemas";
import { apiFetch, errorMessage } from "@/lib/api-client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof loginSchema>, unknown, z.output<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: values });
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-lg font-semibold">Connexion</h1>
        <p className="text-sm text-muted-foreground">Accédez à votre espace de pilotage.</p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Adresse e-mail" error={form.formState.errors.email?.message} required>
        <Input type="email" autoComplete="email" autoFocus {...form.register("email")} />
      </Field>
      <Field label="Mot de passe" error={form.formState.errors.password?.message} required>
        <Input type="password" autoComplete="current-password" {...form.register("password")} />
      </Field>
      <Button type="submit" loading={form.formState.isSubmitting} className="w-full">
        Se connecter
      </Button>
      <Link href="/forgot-password" className="text-center text-sm text-muted-foreground hover:text-foreground">
        Mot de passe oublié ?
      </Link>
    </form>
  );
}
