"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePasswordSchema } from "@/features/auth/schemas";

export function ChangePasswordForm() {
  const form = useForm<z.input<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", password: "", confirm: "" } });
  const { submit } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={form.handleSubmit(async (v) => {
        if (await submit("/api/auth/change-password", "POST", v, { success: "Mot de passe modifié — vos autres sessions ont été fermées" })) form.reset();
      })}
    >
      <Field label="Mot de passe actuel" error={e.currentPassword?.message} required>
        <Input type="password" autoComplete="current-password" {...form.register("currentPassword")} />
      </Field>
      <Field label="Nouveau mot de passe" hint="10 caractères minimum, majuscule, minuscule et chiffre" error={e.password?.message} required>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Confirmation" error={e.confirm?.message} required>
        <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
      </Field>
      <Button type="submit" loading={form.formState.isSubmitting} className="self-start">
        Modifier le mot de passe
      </Button>
    </form>
  );
}
