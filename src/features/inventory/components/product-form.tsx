"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field, FormSection } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { productSchema } from "../schemas";

type Input = z.input<typeof productSchema>;
type Option = { value: string; label: string };

export function ProductForm({ productId, initial, categories, suppliers, locations }: { productId?: string; initial?: Partial<Input>; categories: Option[]; suppliers: Option[]; locations: Option[] }) {
  const form = useForm<Input, unknown, z.output<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: "", barcode: "", name: "", description: "", categoryId: "", unit: "unité", stockManaged: true, serialized: false, alertThreshold: 0,
      purchasePrice: "", rentalPrice: "", replacementValue: "", supplierId: "", weightKg: "", volumeM3: "", lengthCm: "", widthCm: "", heightCm: "", defaultLocationId: "",
      ...initial,
    },
  });
  const { submit, formError } = useApiSubmit<Input, { id: string }>(form.setError);
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit((values) =>
    submit(productId ? `/api/inventory/products/${productId}` : "/api/inventory/products", productId ? "PUT" : "POST", values, {
      success: productId ? "Référence mise à jour" : "Référence créée",
      redirect: (r) => `/inventory/${productId ?? r.id}`,
    }),
  );
  const opt = (list: Option[], empty = "—") => [
    <option key="" value="">
      {empty}
    </option>,
    ...list.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    )),
  ];
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <FormSection title="Référence catalogue" description="Le SKU est unique dans votre organisation.">
        <Field label="Désignation" error={e.name?.message} required className="sm:col-span-2">
          <Input {...form.register("name")} />
        </Field>
        <Field label="SKU" error={e.sku?.message} required>
          <Input className="uppercase" {...form.register("sku")} />
        </Field>
        <Field label="Code-barres (EAN, Code 128…)" error={e.barcode?.message}>
          <Input {...form.register("barcode")} />
        </Field>
        <Field label="Catégorie" error={e.categoryId?.message} required>
          <NativeSelect {...form.register("categoryId")}>{opt(categories, "Choisir…")}</NativeSelect>
        </Field>
        <Field label="Unité" error={e.unit?.message}>
          <Input {...form.register("unit")} />
        </Field>
        <Field label="Description" error={e.description?.message} className="sm:col-span-2">
          <Textarea rows={3} {...form.register("description")} />
        </Field>
      </FormSection>
      <FormSection title="Gestion du stock" description="Désactivez le suivi pour les consommables facturés sans contrôle de disponibilité.">
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <Switch checked={form.watch("stockManaged")} onCheckedChange={(c) => form.setValue("stockManaged", c)} /> Quantité gérée en stock (contrôle de disponibilité)
        </label>
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <Switch checked={form.watch("serialized")} onCheckedChange={(c) => form.setValue("serialized", c)} /> Unités suivies individuellement par numéro de série
        </label>
        <Field label="Seuil d'alerte (disponible ≤)" error={e.alertThreshold?.message}>
          <Input inputMode="numeric" {...form.register("alertThreshold")} />
        </Field>
        <Field label="Emplacement de rangement" error={e.defaultLocationId?.message}>
          <NativeSelect {...form.register("defaultLocationId")}>{opt(locations)}</NativeSelect>
        </Field>
      </FormSection>
      <FormSection title="Prix et valeur" description="Montants HT en euros.">
        <Field label="Prix de location / jour" error={e.rentalPrice?.message}>
          <Input inputMode="decimal" {...form.register("rentalPrice")} />
        </Field>
        <Field label="Prix d'achat" error={e.purchasePrice?.message}>
          <Input inputMode="decimal" {...form.register("purchasePrice")} />
        </Field>
        <Field label="Valeur de remplacement" error={e.replacementValue?.message}>
          <Input inputMode="decimal" {...form.register("replacementValue")} />
        </Field>
        <Field label="Fournisseur principal" error={e.supplierId?.message}>
          <NativeSelect {...form.register("supplierId")}>{opt(suppliers)}</NativeSelect>
        </Field>
      </FormSection>
      <FormSection title="Dimensions" description="Utilisées pour estimer le chargement des véhicules.">
        <Field label="Poids (kg)" error={e.weightKg?.message}>
          <Input inputMode="decimal" {...form.register("weightKg")} />
        </Field>
        <Field label="Volume (m³)" error={e.volumeM3?.message}>
          <Input inputMode="decimal" {...form.register("volumeM3")} />
        </Field>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <Field label="L (cm)" error={e.lengthCm?.message}>
            <Input inputMode="numeric" {...form.register("lengthCm")} />
          </Field>
          <Field label="l (cm)" error={e.widthCm?.message}>
            <Input inputMode="numeric" {...form.register("widthCm")} />
          </Field>
          <Field label="H (cm)" error={e.heightCm?.message}>
            <Input inputMode="numeric" {...form.register("heightCm")} />
          </Field>
        </div>
      </FormSection>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Annuler
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          {productId ? "Enregistrer" : "Créer la référence"}
        </Button>
      </div>
    </form>
  );
}
