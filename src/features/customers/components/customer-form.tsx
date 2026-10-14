"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field, FormSection } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { customerSchema } from "../schemas";

type Input = z.input<typeof customerSchema>;

export function CustomerForm({ initial, customerId }: { initial?: Partial<Input>; customerId?: string }) {
  const form = useForm<Input, unknown, z.output<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: { kind: "COMPANY", name: "", firstName: "", lastName: "", email: "", phone: "", siret: "", vatNumber: "", notes: "", ...initial },
  });
  const { submit, formError } = useApiSubmit<Input, { id: string }>(form.setError);
  const kind = form.watch("kind");
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit((values) =>
    submit(customerId ? `/api/customers/${customerId}` : "/api/customers", customerId ? "PUT" : "POST", values, {
      success: customerId ? "Client mis à jour" : "Client créé",
      redirect: (r) => `/customers/${customerId ?? r.id}`,
    }),
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <FormSection title="Identité" description="Particulier ou entreprise. Limitez les données personnelles au strict nécessaire.">
        <Field label="Type" required className="sm:col-span-2">
          <NativeSelect {...form.register("kind")}>
            <option value="COMPANY">Entreprise / organisme</option>
            <option value="INDIVIDUAL">Particulier</option>
          </NativeSelect>
        </Field>
        {kind === "COMPANY" ? (
          <>
            <Field label="Raison sociale" error={e.name?.message} required className="sm:col-span-2">
              <Input {...form.register("name")} />
            </Field>
            <Field label="SIRET" error={e.siret?.message}>
              <Input inputMode="numeric" {...form.register("siret")} />
            </Field>
            <Field label="N° TVA intracommunautaire" error={e.vatNumber?.message}>
              <Input {...form.register("vatNumber")} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Prénom" error={e.firstName?.message} required>
              <Input autoComplete="off" {...form.register("firstName")} />
            </Field>
            <Field label="Nom" error={e.lastName?.message} required>
              <Input autoComplete="off" {...form.register("lastName")} />
            </Field>
          </>
        )}
      </FormSection>
      <FormSection title="Coordonnées">
        <Field label="E-mail" error={e.email?.message}>
          <Input type="email" {...form.register("email")} />
        </Field>
        <Field label="Téléphone" error={e.phone?.message}>
          <Input type="tel" {...form.register("phone")} />
        </Field>
      </FormSection>
      <FormSection title="Notes commerciales" description="Visibles par les utilisateurs ayant accès aux clients.">
        <Field label="Notes" error={e.notes?.message} className="sm:col-span-2">
          <Textarea rows={4} {...form.register("notes")} />
        </Field>
      </FormSection>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Annuler
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          {customerId ? "Enregistrer" : "Créer le client"}
        </Button>
      </div>
    </form>
  );
}
