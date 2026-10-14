"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { Role } from "@prisma/client";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { registerSchema } from "@/features/auth/schemas";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Option = { value: Role; label: string };

export function RegisterForm({ roles }: { roles: Option[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof registerSchema>, unknown, z.output<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", organizationName: "", role: roles[0]?.value, password: "", confirm: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await apiFetch("/api/auth/register", { method: "POST", body: values });
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-lg font-semibold">Créer un compte</h1>
        <p className="text-sm text-muted-foreground">Créez votre organisation et choisissez votre rôle.</p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Nom complet" error={form.formState.errors.name?.message} required>
        <Input autoComplete="name" autoFocus {...form.register("name")} />
      </Field>
      <Field label="Adresse e-mail" error={form.formState.errors.email?.message} required>
        <Input type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Nom de l'organisation" error={form.formState.errors.organizationName?.message} required>
        <Input autoComplete="organization" {...form.register("organizationName")} />
      </Field>
      <Field label="Rôle" error={form.formState.errors.role?.message} required>
        <NativeSelect {...form.register("role")}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Mot de passe" hint="10 caractères minimum, avec majuscule, minuscule et chiffre" error={form.formState.errors.password?.message} required>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Confirmation du mot de passe" error={form.formState.errors.confirm?.message} required>
        <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
      </Field>
      <Button type="submit" loading={form.formState.isSubmitting} className="w-full">
        Créer mon compte
      </Button>
      <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
        Vous avez déjà un compte ? Se connecter
      </Link>
    </form>
  );
}
