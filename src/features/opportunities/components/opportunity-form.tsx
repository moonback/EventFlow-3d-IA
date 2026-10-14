"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { opportunityStageLabels } from "@/lib/labels";
import { OPPORTUNITY_STAGES, opportunityUpdateSchema, type OpportunityUpdateInput } from "../schemas";

/** Probabilité proposée à chaque changement d'étape (modifiable avant enregistrement). */
const DEFAULT_PROBABILITY: Record<(typeof OPPORTUNITY_STAGES)[number], number> = { NEW: 10, QUALIFIED: 30, QUOTE_SENT: 60, WON: 100, LOST: 0 };

export function OpportunityForm({ id, members, initial }: { id: string; members: { value: string; label: string }[]; initial: OpportunityUpdateInput }) {
  const form = useForm<OpportunityUpdateInput>({ resolver: zodResolver(opportunityUpdateSchema), defaultValues: initial });
  const { submit, formError } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  const stage = form.watch("stage");
  const closed = stage === "WON" || stage === "LOST";
  const stageField = form.register("stage");
  return (
    <form className="flex flex-col gap-3" noValidate onSubmit={form.handleSubmit((v) => submit(`/api/opportunities/${id}`, "PATCH", v, { success: "Demande mise à jour" }))}>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field label="Étape" error={e.stage?.message}>
        <NativeSelect
          {...stageField}
          onChange={(ev) => {
            void stageField.onChange(ev);
            form.setValue("probability", DEFAULT_PROBABILITY[ev.target.value as keyof typeof DEFAULT_PROBABILITY]);
          }}
        >
          {OPPORTUNITY_STAGES.map((s) => (
            <option key={s} value={s}>
              {opportunityStageLabels[s]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Montant estimé (HT)" error={e.estimatedAmount?.message}>
        <Input inputMode="decimal" {...form.register("estimatedAmount")} />
      </Field>
      <Field label="Probabilité de gain (%)" error={e.probability?.message} hint={closed ? "Fixée automatiquement pour une demande clôturée" : undefined}>
        <Input type="number" min={0} max={100} readOnly={closed} {...form.register("probability")} />
      </Field>
      <Field label="Responsable" error={e.ownerId?.message}>
        <NativeSelect {...form.register("ownerId")}>
          <option value="">— Non attribuée —</option>
          {members.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {stage === "LOST" ? (
        <Field label="Motif de perte" error={e.lossReason?.message} required>
          <Input {...form.register("lossReason")} placeholder="Prix, date indisponible, concurrent…" />
        </Field>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={form.formState.isSubmitting}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
