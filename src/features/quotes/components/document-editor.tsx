"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { lineKindLabels } from "@/lib/labels";
import { computeDocumentTotals, formatMoney } from "@/lib/money";
import { idSchema, optionalDate, optionalId, optionalText, requiredText } from "@/lib/zod-helpers";
import { documentLineSchema, LINE_KINDS } from "../schemas";

const editorSchema = z.object({
  customerId: idSchema,
  eventId: optionalId,
  title: requiredText(200),
  validUntil: optionalDate,
  globalDiscountPercent: documentLineSchema.shape.discountPercent,
  notes: optionalText(5000),
  terms: optionalText(5000),
  lines: z.array(documentLineSchema).min(1, "Ajoutez au moins une ligne").max(300),
});
type EditorInput = z.input<typeof editorSchema>;

interface ProductOption {
  value: string;
  label: string;
  name: string;
  rentalPrice: string | null;
}

/** Totaux affichés en direct avec la MÊME bibliothèque Decimal que le serveur (qui reste la référence). */
function safeTotals(lines: EditorInput["lines"], discount: unknown) {
  try {
    return computeDocumentTotals(
      lines.map((l) => ({ quantity: String(l.quantity || 0).replace(",", "."), days: String(l.days || 1).replace(",", "."), unitPrice: String(l.unitPrice || 0).replace(",", "."), discountPercent: String(l.discountPercent || 0).replace(",", "."), vatRate: String(l.vatRate || 0).replace(",", ".") })),
      String(discount || 0).replace(",", "."),
    );
  } catch {
    return null;
  }
}

export function DocumentEditor({
  mode,
  documentId,
  initial,
  customers,
  events,
  products,
  defaultVatRate,
}: {
  mode: "quote" | "invoice";
  documentId?: string;
  initial?: Partial<EditorInput>;
  customers: { value: string; label: string }[];
  events: { value: string; label: string; customerId: string }[];
  products: ProductOption[];
  defaultVatRate: string;
}) {
  const emptyLine = { kind: "EQUIPMENT" as const, productId: "", description: "", quantity: "1", days: "1", unitPrice: "0", discountPercent: "0", vatRate: defaultVatRate };
  const form = useForm<EditorInput>({
    resolver: zodResolver(editorSchema),
    defaultValues: { customerId: "", eventId: "", title: "", validUntil: "", globalDiscountPercent: "0", notes: "", terms: "", lines: [emptyLine], ...initial },
  });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "lines" });
  const lines = useWatch({ control: form.control, name: "lines" });
  const discount = useWatch({ control: form.control, name: "globalDiscountPercent" });
  const customerId = useWatch({ control: form.control, name: "customerId" });
  const totals = useMemo(() => safeTotals(lines ?? [], discount), [lines, discount]);
  const { submit, formError } = useApiSubmit<EditorInput, { id: string }>(form.setError);
  const base = mode === "quote" ? "/api/quotes" : "/api/invoices";
  const page = mode === "quote" ? "/quotes" : "/invoices";
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    const body = mode === "quote" ? values : { customerId: values.customerId, eventId: values.eventId, title: values.title, globalDiscountPercent: values.globalDiscountPercent, notes: values.notes, lines: values.lines };
    return submit(documentId ? `${base}/${documentId}` : base, documentId ? "PUT" : "POST", body, { success: "Document enregistré", redirect: (r) => `${page}/${documentId ?? r.id}` });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Client" error={e.customerId?.message} required>
            <NativeSelect {...form.register("customerId")}>
              <option value="">Choisir…</option>
              {customers.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Événement" error={e.eventId?.message}>
            <NativeSelect {...form.register("eventId")}>
              <option value="">—</option>
              {events
                .filter((ev) => !customerId || ev.customerId === customerId)
                .map((ev) => (
                  <option key={ev.value} value={ev.value}>
                    {ev.label}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Objet" error={e.title?.message} required className="lg:col-span-2">
            <Input {...form.register("title")} />
          </Field>
          {mode === "quote" ? (
            <Field label="Valable jusqu'au" error={e.validUntil?.message} hint="Par défaut selon les paramètres">
              <Input type="date" {...form.register("validUntil")} />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Lignes</CardTitle>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => append({ ...emptyLine, kind: "LABOR", description: "Main-d'œuvre technique" })}>
              <Plus /> Main-d&apos;œuvre
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => append({ ...emptyLine, kind: "TRANSPORT", description: "Transport aller-retour" })}>
              <Plus /> Transport
            </Button>
            <Button type="button" size="sm" onClick={() => append(emptyLine)}>
              <Plus /> Ligne
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {e.lines?.message ? <p className="text-sm text-destructive">{e.lines.message}</p> : null}
          {fields.map((f, i) => {
            const le = e.lines?.[i];
            return (
              <div key={f.id} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[auto_120px_1fr_80px_70px_100px_70px_70px_110px_auto] md:items-start">
                <div className="hidden flex-col gap-1 pt-2 md:flex">
                  <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Monter la ligne">
                    <GripVertical className="size-4" />
                  </button>
                </div>
                <NativeSelect aria-label={`Type ligne ${i + 1}`} {...form.register(`lines.${i}.kind`)}>
                  {LINE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {lineKindLabels[k]}
                    </option>
                  ))}
                </NativeSelect>
                <div className="flex flex-col gap-1.5">
                  {lines?.[i]?.kind === "EQUIPMENT" ? (
                    <NativeSelect
                      aria-label={`Produit ligne ${i + 1}`}
                      {...form.register(`lines.${i}.productId`, {
                        onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => {
                          const p = products.find((x) => x.value === ev.target.value);
                          if (p) {
                            form.setValue(`lines.${i}.description`, p.name);
                            if (p.rentalPrice) form.setValue(`lines.${i}.unitPrice`, p.rentalPrice);
                          }
                        },
                      })}
                    >
                      <option value="">Produit du catalogue…</option>
                      {products.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : null}
                  <Input aria-label={`Désignation ligne ${i + 1}`} aria-invalid={le?.description ? true : undefined} placeholder="Désignation" {...form.register(`lines.${i}.description`)} />
                  {le?.description ? <p className="text-xs text-destructive">{le.description.message}</p> : null}
                </div>
                <Input aria-label={`Quantité ligne ${i + 1}`} aria-invalid={le?.quantity ? true : undefined} inputMode="decimal" placeholder="Qté" {...form.register(`lines.${i}.quantity`)} />
                <Input aria-label={`Jours ligne ${i + 1}`} inputMode="decimal" placeholder="Jours" {...form.register(`lines.${i}.days`)} />
                <Input aria-label={`Prix unitaire HT ligne ${i + 1}`} aria-invalid={le?.unitPrice ? true : undefined} inputMode="decimal" placeholder="PU HT" {...form.register(`lines.${i}.unitPrice`)} />
                <Input aria-label={`Remise % ligne ${i + 1}`} inputMode="decimal" placeholder="Rem. %" {...form.register(`lines.${i}.discountPercent`)} />
                <Input aria-label={`TVA % ligne ${i + 1}`} inputMode="decimal" placeholder="TVA %" {...form.register(`lines.${i}.vatRate`)} />
                <p className="pt-2 text-right text-sm font-medium tabular-nums">{totals ? formatMoney(totals.lineTotals[i] ?? "0") : "—"}</p>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Supprimer la ligne ${i + 1}`} onClick={() => remove(i)} disabled={fields.length === 1}>
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Colonnes : type · désignation · quantité · jours · prix unitaire HT · remise % · TVA % · total HT</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="grid gap-4 pt-5">
            <Field label="Notes (imprimées)">
              <Textarea rows={3} {...form.register("notes")} />
            </Field>
            {mode === "quote" ? (
              <Field label="Conditions (imprimées)">
                <Textarea rows={3} {...form.register("terms")} />
              </Field>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 pt-5 text-sm">
            <Field label="Remise globale (%)" error={e.globalDiscountPercent?.message}>
              <Input inputMode="decimal" {...form.register("globalDiscountPercent")} />
            </Field>
            {totals ? (
              <dl className="mt-2 flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Sous-total HT</dt>
                  <dd className="tabular-nums">{formatMoney(totals.subtotalExclTax)}</dd>
                </div>
                {Number(totals.globalDiscountAmount) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Remise</dt>
                    <dd className="tabular-nums">− {formatMoney(totals.globalDiscountAmount)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total HT</dt>
                  <dd className="tabular-nums">{formatMoney(totals.totalExclTax)}</dd>
                </div>
                {totals.vat.map((v) => (
                  <div key={v.rate} className="flex justify-between">
                    <dt className="text-muted-foreground">TVA {Number(v.rate)} %</dt>
                    <dd className="tabular-nums">{formatMoney(v.tax)}</dd>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <dt>Total TTC</dt>
                  <dd className="tabular-nums">{formatMoney(totals.totalInclTax)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-destructive">Valeurs invalides : vérifiez les quantités, prix et taux.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Annuler
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          Enregistrer le brouillon
        </Button>
      </div>
    </form>
  );
}
