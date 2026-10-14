"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { eventTypeSchema } from "@/features/events/schemas";

export function EventTypeForm() {
  const form = useForm<z.input<typeof eventTypeSchema>>({ resolver: zodResolver(eventTypeSchema), defaultValues: { name: "", color: "#6366f1" } });
  const { submit } = useApiSubmit(form.setError);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau type</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            if (await submit("/api/event-types", "POST", v, { success: "Type créé" })) form.reset();
          })}
        >
          <Field label="Nom" error={form.formState.errors.name?.message} required>
            <Input {...form.register("name")} />
          </Field>
          <Field label="Couleur">
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
