"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";

export function ResolveDialog({ ticketId, reference, remaining, storage }: { ticketId: string; reference: string; remaining: number; storage: { value: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [repaired, setRepaired] = useState(String(remaining));
  const [scrapped, setScrapped] = useState("0");
  const [to, setTo] = useState(storage[0]?.value ?? "");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const save = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/maintenance/${ticketId}/resolve`, { method: "POST", body: { quantityRepaired: Number(repaired), quantityScrapped: Number(scrapped), toLocationId: to || null, cost: cost || null, notes: notes || null } });
      toast.success("Maintenance clôturée");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Clôturer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clôturer {reference}</DialogTitle>
          <DialogDescription>{remaining} unité(s) à traiter. Les unités réparées redeviennent disponibles ; les unités mises au rebut sortent du stock.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Réparées">
            <Input type="number" min={0} max={remaining} value={repaired} onChange={(e) => setRepaired(e.target.value)} />
          </Field>
          <Field label="Mises au rebut">
            <Input type="number" min={0} max={remaining} value={scrapped} onChange={(e) => setScrapped(e.target.value)} />
          </Field>
          <Field label="Remise en stock vers" className="sm:col-span-2">
            <NativeSelect value={to} onChange={(e) => setTo(e.target.value)}>
              {storage.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Coût de réparation HT (€)" hint="Crée une dépense de maintenance">
            <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Compte rendu">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={save} loading={loading} disabled={Number(repaired) + Number(scrapped) < 1 || Number(repaired) + Number(scrapped) > remaining}>
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
