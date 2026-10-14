"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { addressSchema, contactSchema } from "../schemas";

export function AddContactDialog({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof contactSchema>>({ resolver: zodResolver(contactSchema), defaultValues: { firstName: "", lastName: "", jobTitle: "", email: "", phone: "", isPrimary: false } });
  const { submit } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus /> Contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau contact</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            if (await submit(`/api/customers/${customerId}/contacts`, "POST", v, { success: "Contact ajouté" })) {
              form.reset();
              setOpen(false);
            }
          })}
        >
          <Field label="Prénom" error={e.firstName?.message} required>
            <Input {...form.register("firstName")} />
          </Field>
          <Field label="Nom" error={e.lastName?.message} required>
            <Input {...form.register("lastName")} />
          </Field>
          <Field label="Fonction" error={e.jobTitle?.message} className="sm:col-span-2">
            <Input {...form.register("jobTitle")} />
          </Field>
          <Field label="E-mail" error={e.email?.message}>
            <Input type="email" {...form.register("email")} />
          </Field>
          <Field label="Téléphone" error={e.phone?.message}>
            <Input type="tel" {...form.register("phone")} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={form.watch("isPrimary")} onCheckedChange={(c) => form.setValue("isPrimary", c === true)} /> Contact principal
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={form.formState.isSubmitting}>
              Ajouter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddAddressDialog({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof addressSchema>>({ resolver: zodResolver(addressSchema), defaultValues: { kind: "BILLING", label: "", line1: "", line2: "", postalCode: "", city: "", country: "FR", isDefault: true } });
  const { submit } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MapPin /> Adresse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle adresse</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            if (await submit(`/api/customers/${customerId}/addresses`, "POST", v, { success: "Adresse ajoutée" })) {
              form.reset();
              setOpen(false);
            }
          })}
        >
          <Field label="Type" required>
            <NativeSelect {...form.register("kind")}>
              <option value="BILLING">Facturation</option>
              <option value="EVENT">Lieu d&apos;événement</option>
              <option value="OTHER">Autre</option>
            </NativeSelect>
          </Field>
          <Field label="Libellé" error={e.label?.message}>
            <Input {...form.register("label")} />
          </Field>
          <Field label="Adresse" error={e.line1?.message} required className="sm:col-span-2">
            <Input autoComplete="address-line1" {...form.register("line1")} />
          </Field>
          <Field label="Complément" error={e.line2?.message} className="sm:col-span-2">
            <Input autoComplete="address-line2" {...form.register("line2")} />
          </Field>
          <Field label="Code postal" error={e.postalCode?.message} required>
            <Input autoComplete="postal-code" {...form.register("postalCode")} />
          </Field>
          <Field label="Ville" error={e.city?.message} required>
            <Input autoComplete="address-level2" {...form.register("city")} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={form.watch("isDefault")} onCheckedChange={(c) => form.setValue("isDefault", c === true)} /> Adresse par défaut pour ce type
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={form.formState.isSubmitting}>
              Ajouter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
