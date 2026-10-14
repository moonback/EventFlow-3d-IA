"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Wrench } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { vehicleMaintenanceSchema } from "../schemas";

export function VehicleMaintenanceDialog({ vehicleId, onDone }: { vehicleId: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof vehicleMaintenanceSchema>>({ resolver: zodResolver(vehicleMaintenanceSchema), defaultValues: { title: "", scheduledAt: new Date().toISOString().slice(0, 10), completedAt: "", mileageKm: "", cost: "", notes: "", blocksVehicle: true } });
  const { submit } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Wrench /> Entretien
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planifier un entretien</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            if (await submit(`/api/vehicles/${vehicleId}/maintenance`, "POST", v, { success: "Entretien enregistré" })) {
              form.reset();
              setOpen(false);
              onDone?.();
            }
          })}
        >
          <Field label="Intervention" error={e.title?.message} required className="sm:col-span-2">
            <Input {...form.register("title")} />
          </Field>
          <Field label="Date prévue" error={e.scheduledAt?.message} required>
            <Input type="date" {...form.register("scheduledAt")} />
          </Field>
          <Field label="Réalisé le" error={e.completedAt?.message}>
            <Input type="date" {...form.register("completedAt")} />
          </Field>
          <Field label="Kilométrage" error={e.mileageKm?.message}>
            <Input inputMode="numeric" {...form.register("mileageKm")} />
          </Field>
          <Field label="Coût HT (€)" error={e.cost?.message}>
            <Input inputMode="decimal" {...form.register("cost")} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={form.watch("blocksVehicle")} onCheckedChange={(c) => form.setValue("blocksVehicle", c === true)} /> Véhicule indisponible pendant l&apos;intervention
          </label>
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
