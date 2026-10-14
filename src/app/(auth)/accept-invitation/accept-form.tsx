"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptInvitationSchema } from "@/features/auth/schemas";
import { apiFetch, errorMessage } from "@/lib/api-client";

export function AcceptInvitationForm({ token, email, organization, role }: { token: string; email: string; organization: string; role: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof acceptInvitationSchema>>({ resolver: zodResolver(acceptInvitationSchema), defaultValues: { token, name: "", password: "", confirm: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await apiFetch("/api/auth/accept-invitation", { method: "POST", body: values });
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-lg font-semibold">Rejoindre {organization}</h1>
        <p className="text-sm text-muted-foreground">
          {email} — rôle : {role}
        </p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Nom complet" error={form.formState.errors.name?.message} required>
        <Input autoComplete="name" {...form.register("name")} />
      </Field>
      <Field label="Mot de passe" hint="Si vous avez déjà un compte, saisissez son mot de passe" error={form.formState.errors.password?.message} required>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Confirmation" error={form.formState.errors.confirm?.message} required>
        <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
      </Field>
      <Button type="submit" loading={form.formState.isSubmitting}>
        Accepter l&apos;invitation
      </Button>
    </form>
  );
}
