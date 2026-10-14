"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { LOCATION_KINDS, locationSchema } from "@/features/inventory/schemas";
import { locationKindLabels } from "@/lib/labels";

export function LocationDialog({ parents, initial, locationId }: { parents: { value: string; label: string }[]; initial?: Partial<z.input<typeof locationSchema>>; locationId?: string }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof locationSchema>>({ resolver: zodResolver(locationSchema), defaultValues: { code: "", name: "", kind: "RACK", parentId: "", description: "", isActive: true, ...initial } });
  const { submit } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={locationId ? "outline" : "default"}>
          {locationId ? "Modifier" : (
            <>
              <Plus /> Emplacement
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{locationId ? "Modifier l'emplacement" : "Nouvel emplacement"}</DialogTitle>
          <DialogDescription>Entrepôt, zone, rayonnage, emplacement, préparation, retour, quarantaine ou atelier.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            if (await submit(locationId ? `/api/inventory/locations/${locationId}` : "/api/inventory/locations", locationId ? "PUT" : "POST", v, { success: "Emplacement enregistré" })) {
              if (!locationId) form.reset();
              setOpen(false);
            }
          })}
        >
          <Field label="Code" error={e.code?.message} required>
            <Input className="uppercase" {...form.register("code")} />
          </Field>
          <Field label="Nature" error={e.kind?.message} required>
            <NativeSelect {...form.register("kind")}>
              {LOCATION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {locationKindLabels[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Nom" error={e.name?.message} required className="sm:col-span-2">
            <Input {...form.register("name")} />
          </Field>
          <Field label="Parent" className="sm:col-span-2">
            <NativeSelect {...form.register("parentId")}>
              <option value="">—</option>
              {parents
                .filter((p) => p.value !== locationId)
                .map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={form.formState.isSubmitting}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
