"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field, FormSection } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { eventSchema } from "../schemas";

type Input = z.input<typeof eventSchema>;
type Option = { value: string; label: string };

const TIMEZONES = ["Europe/Paris", "Europe/Brussels", "Europe/Zurich", "Europe/London", "Europe/Madrid", "America/Montreal", "Indian/Reunion", "America/Guadeloupe", "America/Martinique", "Pacific/Noumea", "Pacific/Tahiti"];

export function EventForm({ eventId, initial, customers, types, managers }: { eventId?: string; initial?: Partial<Input>; customers: Option[]; types: Option[]; managers: Option[] }) {
  const form = useForm<Input, unknown, z.output<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: "",
      customerId: "",
      eventTypeId: "",
      managerId: "",
      timezone: "Europe/Paris",
      startLocal: "",
      endLocal: "",
      setupStartLocal: "",
      teardownEndLocal: "",
      venueName: "",
      addressLine1: "",
      postalCode: "",
      city: "",
      country: "FR",
      guestCount: "",
      budgetAmount: "",
      estimatedCost: "",
      description: "",
      ...initial,
    },
  });
  const { submit, formError } = useApiSubmit<Input, { id: string }>(form.setError);
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit((values) =>
    submit(eventId ? `/api/events/${eventId}` : "/api/events", eventId ? "PUT" : "POST", values, {
      success: eventId ? "Événement mis à jour" : "Événement créé",
      redirect: (r) => `/events/${eventId ?? r.id}`,
    }),
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <FormSection title="Événement" description="Informations générales et client.">
        <Field label="Nom de l'événement" error={e.name?.message} required className="sm:col-span-2">
          <Input {...form.register("name")} />
        </Field>
        <Field label="Client" error={e.customerId?.message} required>
          <NativeSelect {...form.register("customerId")}>
            <option value="">Choisir un client…</option>
            {customers.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Type" error={e.eventTypeId?.message}>
          <NativeSelect {...form.register("eventTypeId")}>
            <option value="">—</option>
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Responsable" error={e.managerId?.message}>
          <NativeSelect {...form.register("managerId")}>
            <option value="">—</option>
            {managers.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Nombre d'invités" error={e.guestCount?.message}>
          <Input inputMode="numeric" {...form.register("guestCount")} />
        </Field>
      </FormSection>
      <FormSection title="Dates et horaires" description="Heures locales du lieu de l'événement ; elles sont converties et enregistrées en UTC.">
        <Field label="Fuseau horaire" error={e.timezone?.message} className="sm:col-span-2">
          <NativeSelect {...form.register("timezone")}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Début de l'événement" error={e.startLocal?.message} required>
          <Input type="datetime-local" {...form.register("startLocal")} />
        </Field>
        <Field label="Fin de l'événement" error={e.endLocal?.message} required>
          <Input type="datetime-local" {...form.register("endLocal")} />
        </Field>
        <Field label="Début du montage" error={e.setupStartLocal?.message} hint="Utilisé pour la période de réservation du matériel">
          <Input type="datetime-local" {...form.register("setupStartLocal")} />
        </Field>
        <Field label="Fin du démontage" error={e.teardownEndLocal?.message}>
          <Input type="datetime-local" {...form.register("teardownEndLocal")} />
        </Field>
      </FormSection>
      <FormSection title="Lieu">
        <Field label="Nom du lieu" error={e.venueName?.message} className="sm:col-span-2">
          <Input {...form.register("venueName")} />
        </Field>
        <Field label="Adresse" error={e.addressLine1?.message} className="sm:col-span-2">
          <Input {...form.register("addressLine1")} />
        </Field>
        <Field label="Code postal" error={e.postalCode?.message}>
          <Input {...form.register("postalCode")} />
        </Field>
        <Field label="Ville" error={e.city?.message}>
          <Input {...form.register("city")} />
        </Field>
      </FormSection>
      <FormSection title="Budget" description="Montants HT. Le coût estimé, s'il est renseigné, remplace le calcul automatique du coût prévisionnel.">
        <Field label="Budget client (€ HT)" error={e.budgetAmount?.message}>
          <Input inputMode="decimal" {...form.register("budgetAmount")} />
        </Field>
        <Field label="Coût estimé (€ HT)" error={e.estimatedCost?.message}>
          <Input inputMode="decimal" {...form.register("estimatedCost")} />
        </Field>
        <Field label="Description / brief" error={e.description?.message} className="sm:col-span-2">
          <Textarea rows={4} {...form.register("description")} />
        </Field>
      </FormSection>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Annuler
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          {eventId ? "Enregistrer" : "Créer l'événement"}
        </Button>
      </div>
    </form>
  );
}
