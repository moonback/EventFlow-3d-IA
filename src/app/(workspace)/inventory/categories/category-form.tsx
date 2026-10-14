"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { categorySchema } from "@/features/inventory/schemas";

export function CategoryForm() {
  const form = useForm<z.input<typeof categorySchema>>({ resolver: zodResolver(categorySchema), defaultValues: { name: "", code: "", color: "#64748b", sortOrder: 0 } });
  const { submit } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouvelle catégorie</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            if (await submit("/api/inventory/categories", "POST", v, { success: "Catégorie créée" })) form.reset();
          })}
        >
          <Field label="Nom" error={e.name?.message} required>
            <Input {...form.register("name")} />
          </Field>
          <Field label="Code" error={e.code?.message} required hint="Utilisé pour les imports CSV (ex. LUM)">
            <Input className="uppercase" {...form.register("code")} />
          </Field>
          <Field label="Couleur" error={e.color?.message}>
            <Input type="color" className="h-9 w-20 p-1" {...form.register("color")} />
          </Field>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Créer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
