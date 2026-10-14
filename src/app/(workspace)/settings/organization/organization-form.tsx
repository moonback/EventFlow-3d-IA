"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field, FormSection } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { organizationSettingsSchema } from "@/features/settings/schemas";

type Input = z.input<typeof organizationSettingsSchema>;

export function OrganizationForm({ initial }: { initial: Input }) {
  const form = useForm<Input>({ resolver: zodResolver(organizationSettingsSchema), defaultValues: initial });
  const { submit, formError } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit((v) => submit("/api/settings/organization", "PUT", v, { success: "Paramètres enregistrés" }))}>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <FormSection title="Identité" description="Imprimée sur les devis et factures.">
        <Field label="Nom usuel" error={e.name?.message} required>
          <Input {...form.register("name")} />
        </Field>
        <Field label="Raison sociale" error={e.legalName?.message}>
          <Input {...form.register("legalName")} />
        </Field>
        <Field label="SIRET" error={e.siret?.message}>
          <Input {...form.register("siret")} />
        </Field>
        <Field label="N° TVA" error={e.vatNumber?.message}>
          <Input {...form.register("vatNumber")} />
        </Field>
        <Field label="E-mail" error={e.email?.message}>
          <Input type="email" {...form.register("email")} />
        </Field>
        <Field label="Téléphone" error={e.phone?.message}>
          <Input {...form.register("phone")} />
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
        <Field label="Couleur d'accent (documents et habillage 3D)" error={e.accentColor?.message}>
          <Input type="color" className="h-9 w-20 p-1" {...form.register("accentColor")} />
        </Field>
      </FormSection>
      <FormSection title="Règles commerciales">
        <Field label="Taux de TVA par défaut (%)" error={e.defaultVatRate?.message}>
          <Input inputMode="decimal" {...form.register("defaultVatRate")} />
        </Field>
        <Field label="Délai de paiement (jours)" error={e.paymentTermDays?.message}>
          <Input type="number" {...form.register("paymentTermDays")} />
        </Field>
        <Field label="Validité des devis (jours)" error={e.quoteValidityDays?.message}>
          <Input type="number" {...form.register("quoteValidityDays")} />
        </Field>
        <Field label="Fuseau horaire" error={e.timezone?.message}>
          <Input {...form.register("timezone")} />
        </Field>
      </FormSection>
      <FormSection title="Logistique" description="Tampons par défaut appliqués aux nouvelles réservations (blocage du stock avant / après).">
        <Field label="Préparation / transport (heures)" error={e.prepBufferHours?.message}>
          <Input type="number" {...form.register("prepBufferHours")} />
        </Field>
        <Field label="Retour / contrôle (heures)" error={e.returnBufferHours?.message}>
          <Input type="number" {...form.register("returnBufferHours")} />
        </Field>
      </FormSection>
      <FormSection title="Mentions des documents" description="À faire valider par votre expert-comptable / conseil juridique.">
        <Field label="Pied de page des devis" className="sm:col-span-2">
          <Textarea rows={2} {...form.register("quoteFooter")} />
        </Field>
        <Field label="Pied de page des factures" className="sm:col-span-2">
          <Textarea rows={2} {...form.register("invoiceFooter")} />
        </Field>
        <Field label="Conditions de paiement et pénalités de retard" className="sm:col-span-2">
          <Textarea rows={2} {...form.register("latePenaltyText")} />
        </Field>
      </FormSection>
      <div className="flex justify-end">
        <Button type="submit" loading={form.formState.isSubmitting}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
