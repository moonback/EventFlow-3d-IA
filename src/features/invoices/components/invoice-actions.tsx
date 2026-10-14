"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreditCard, FileMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Field } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { paymentMethodLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { paymentSchema } from "../schemas";

export function PaymentDialog({ invoiceId, balanceDue }: { invoiceId: string; balanceDue: string }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { invoiceId, amount: balanceDue, method: "BANK_TRANSFER", paidAt: new Date().toISOString().slice(0, 10), reference: "", notes: "" },
  });
  const { submit } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CreditCard /> Enregistrer un paiement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Encaissement</DialogTitle>
          <DialogDescription>Reste dû : {formatMoney(balanceDue)}. Un paiement ne peut pas dépasser le solde.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            if (await submit("/api/payments", "POST", v, { success: "Paiement enregistré" })) setOpen(false);
          })}
        >
          <Field label="Montant TTC (€)" error={e.amount?.message} required>
            <Input inputMode="decimal" {...form.register("amount")} />
          </Field>
          <Field label="Date" error={e.paidAt?.message} required>
            <Input type="date" {...form.register("paidAt")} />
          </Field>
          <Field label="Mode de paiement" required>
            <NativeSelect {...form.register("method")}>
              {Object.entries(paymentMethodLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Référence (n° de virement, chèque…)">
            <Input {...form.register("reference")} />
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

/** Avoir total : copie des lignes de la facture ; il reste à émettre (numérotation dédiée). */
export function CreditNoteDialog({ invoiceId, number }: { invoiceId: string; number: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const create = async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ id: string }>(`/api/invoices/${invoiceId}/credit-note`, { method: "POST", body: { reason } });
      toast.success("Avoir brouillon créé : vérifiez-le puis émettez-le");
      router.push(`/invoices/${r.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileMinus /> Créer un avoir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avoir sur {number}</DialogTitle>
          <DialogDescription>Une facture émise n&apos;est jamais modifiée : toute correction passe par un avoir (ajustable avant émission).</DialogDescription>
        </DialogHeader>
        <Field label="Motif" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button onClick={create} loading={loading} disabled={reason.trim().length < 1}>
            Créer l&apos;avoir brouillon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
