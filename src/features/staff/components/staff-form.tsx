"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field, FormSection } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox, Switch } from "@/components/ui/misc";
import { employmentTypeLabels } from "@/lib/labels";
import { staffSchema } from "../schemas";

type Input = z.input<typeof staffSchema>;

export function StaffForm({ staffId, initial, skills, users, canCosts }: { staffId?: string; initial?: Partial<Input>; skills: { id: string; name: string }[]; users: { value: string; label: string }[]; canCosts: boolean }) {
  const form = useForm<Input, unknown, z.output<typeof staffSchema>>({
    resolver: zodResolver(staffSchema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", jobTitle: "", employmentType: "EMPLOYEE", hourlyCost: "", dailyCost: "", drivingLicenses: "", isActive: true, userId: "", notes: "", skillIds: [], ...initial },
  });
  const { submit, formError } = useApiSubmit<Input, { id: string }>(form.setError);
  const e = form.formState.errors;
  const selected = form.watch("skillIds") ?? [];
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit((v) => submit(staffId ? `/api/staff/${staffId}` : "/api/staff", staffId ? "PUT" : "POST", v, { success: "Collaborateur enregistré", redirect: (r) => `/team/${staffId ?? r.id}` }))}>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <FormSection title="Collaborateur" description="Statut opérationnel, distinct du compte d'accès au logiciel.">
        <Field label="Prénom" error={e.firstName?.message} required>
          <Input {...form.register("firstName")} />
        </Field>
        <Field label="Nom" error={e.lastName?.message} required>
          <Input {...form.register("lastName")} />
        </Field>
        <Field label="Poste" error={e.jobTitle?.message}>
          <Input {...form.register("jobTitle")} />
        </Field>
        <Field label="Statut">
          <NativeSelect {...form.register("employmentType")}>
            {Object.entries(employmentTypeLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="E-mail" error={e.email?.message}>
          <Input type="email" {...form.register("email")} />
        </Field>
        <Field label="Téléphone" error={e.phone?.message}>
          <Input type="tel" {...form.register("phone")} />
        </Field>
        <Field label="Permis de conduire" hint="ex. B C CE" error={e.drivingLicenses?.message}>
          <Input {...form.register("drivingLicenses")} />
        </Field>
        <Field label="Compte logiciel lié">
          <NativeSelect {...form.register("userId")}>
            <option value="">Aucun</option>
            {users.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <Switch checked={form.watch("isActive")} onCheckedChange={(c) => form.setValue("isActive", c)} /> Actif (peut être affecté)
        </label>
      </FormSection>
      <FormSection title="Compétences" description="Vérifiées lors des affectations exigeant une compétence.">
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
          {skills.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(s.id)}
                onCheckedChange={(c) => form.setValue("skillIds", c ? [...selected, s.id] : selected.filter((x) => x !== s.id))}
              />
              {s.name}
            </label>
          ))}
          {skills.length === 0 ? <p className="text-sm text-muted-foreground">Aucune compétence définie (Équipe → Compétences).</p> : null}
        </div>
      </FormSection>
      {canCosts ? (
        <FormSection title="Coûts" description="Données confidentielles, visibles uniquement avec la permission « coûts du personnel ».">
          <Field label="Coût horaire chargé (€)" error={e.hourlyCost?.message}>
            <Input inputMode="decimal" {...form.register("hourlyCost")} />
          </Field>
          <Field label="Coût journalier (€)" error={e.dailyCost?.message}>
            <Input inputMode="decimal" {...form.register("dailyCost")} />
          </Field>
        </FormSection>
      ) : null}
      <FormSection title="Notes">
        <Field label="Notes internes" className="sm:col-span-2">
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
