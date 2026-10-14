"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field, FormSection } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { vehicleStatusLabels, vehicleTypeLabels } from "@/lib/labels";
import { vehicleSchema } from "../schemas";

type Input = z.input<typeof vehicleSchema>;

export function VehicleForm({ vehicleId, initial }: { vehicleId?: string; initial?: Partial<Input> }) {
  const form = useForm<Input, unknown, z.output<typeof vehicleSchema>>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { registration: "", brand: "", model: "", type: "VAN", status: "AVAILABLE", payloadKg: "", volumeM3: "", mileageKm: 0, requiredLicense: "B", insuranceExpiresAt: "", inspectionDueAt: "", nextServiceAt: "", nextServiceKm: "", dailyCost: "", costPerKm: "", notes: "", ...initial },
  });
  const { submit, formError } = useApiSubmit<Input, { id: string }>(form.setError);
  const e = form.formState.errors;
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((v) => submit(vehicleId ? `/api/vehicles/${vehicleId}` : "/api/vehicles", vehicleId ? "PUT" : "POST", v, { success: "Véhicule enregistré", redirect: (r) => `/vehicles/${vehicleId ?? r.id}` }))}
    >
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <FormSection title="Identification">
        <Field label="Immatriculation" error={e.registration?.message} required>
          <Input className="uppercase" placeholder="AB-123-CD" {...form.register("registration")} />
        </Field>
        <Field label="Type" required>
          <NativeSelect {...form.register("type")}>
            {Object.entries(vehicleTypeLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Marque" error={e.brand?.message} required>
          <Input {...form.register("brand")} />
        </Field>
        <Field label="Modèle" error={e.model?.message} required>
          <Input {...form.register("model")} />
        </Field>
        <Field label="Statut administratif" hint="« Affecté » et « en mission » sont calculés à partir du planning">
          <NativeSelect {...form.register("status")}>
            {Object.entries(vehicleStatusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Permis requis" error={e.requiredLicense?.message}>
          <Input {...form.register("requiredLicense")} />
        </Field>
      </FormSection>
      <FormSection title="Capacité" description="Utilisée pour refuser les dépassements de charge.">
        <Field label="Charge utile (kg)" error={e.payloadKg?.message}>
          <Input inputMode="numeric" {...form.register("payloadKg")} />
        </Field>
        <Field label="Volume utile (m³)" error={e.volumeM3?.message}>
          <Input inputMode="decimal" {...form.register("volumeM3")} />
        </Field>
        <Field label="Kilométrage" error={e.mileageKm?.message}>
          <Input inputMode="numeric" {...form.register("mileageKm")} />
        </Field>
      </FormSection>
      <FormSection title="Contrôles et entretien">
        <Field label="Fin d'assurance" error={e.insuranceExpiresAt?.message}>
          <Input type="date" {...form.register("insuranceExpiresAt")} />
        </Field>
        <Field label="Contrôle technique" error={e.inspectionDueAt?.message}>
          <Input type="date" {...form.register("inspectionDueAt")} />
        </Field>
        <Field label="Prochain entretien (date)" error={e.nextServiceAt?.message}>
          <Input type="date" {...form.register("nextServiceAt")} />
        </Field>
        <Field label="Prochain entretien (km)" error={e.nextServiceKm?.message}>
          <Input inputMode="numeric" {...form.register("nextServiceKm")} />
        </Field>
      </FormSection>
      <FormSection title="Coûts" description="Utilisés pour le coût de transport des événements (HT).">
        <Field label="Coût par jour (€)" error={e.dailyCost?.message}>
          <Input inputMode="decimal" {...form.register("dailyCost")} />
        </Field>
        <Field label="Coût par km (€)" error={e.costPerKm?.message}>
          <Input inputMode="decimal" {...form.register("costPerKm")} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} {...form.register("notes")} />
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
