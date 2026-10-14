"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field, FormSection } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { supplierSchema } from "../schemas";

type Input = z.input<typeof supplierSchema>;

export function SupplierForm({ supplierId, initial }: { supplierId?: string; initial?: Partial<Input> }) {
  const form = useForm<Input, unknown, z.output<typeof supplierSchema>>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: "", email: "", phone: "", website: "", addressLine1: "", postalCode: "", city: "", country: "FR", siret: "", vatNumber: "", notes: "", ...initial },
  });
  const { submit, formError } = useApiSubmit<Input, { id: string }>(form.setError);
  const e = form.formState.errors;
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit((v) => submit(supplierId ? `/api/suppliers/${supplierId}` : "/api/suppliers", supplierId ? "PUT" : "POST", v, { success: "Fournisseur enregistré", redirect: (r) => `/suppliers/${supplierId ?? r.id}` }))}>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <FormSection title="Fournisseur">
        <Field label="Raison sociale" error={e.name?.message} required className="sm:col-span-2">
          <Input {...form.register("name")} />
        </Field>
        <Field label="E-mail" error={e.email?.message}>
          <Input type="email" {...form.register("email")} />
        </Field>
        <Field label="Téléphone" error={e.phone?.message}>
          <Input type="tel" {...form.register("phone")} />
        </Field>
        <Field label="Site web" error={e.website?.message}>
          <Input {...form.register("website")} />
        </Field>
        <Field label="SIRET" error={e.siret?.message}>
          <Input {...form.register("siret")} />
        </Field>
        <Field label="Adresse" className="sm:col-span-2">
          <Input {...form.register("addressLine1")} />
        </Field>
        <Field label="Code postal">
          <Input {...form.register("postalCode")} />
        </Field>
        <Field label="Ville">
          <Input {...form.register("city")} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={3} {...form.register("notes")} />
        </Field>
      </FormSection>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Annuler
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
