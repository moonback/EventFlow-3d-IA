"use client";
import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";

export function ReverseMovementButton({ movementId, label }: { movementId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const save = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/stock/movements/${movementId}/reverse`, { method: "POST", body: { reason } });
      toast.success("Mouvement compensatoire enregistré");
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
        <Button size="sm" variant="ghost" aria-label={`Compenser ${label}`}>
          <Undo2 /> Compenser
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compenser ce mouvement</DialogTitle>
          <DialogDescription>{label} — le mouvement d&apos;origine reste dans le journal ; un mouvement inverse est ajouté.</DialogDescription>
        </DialogHeader>
        <Field label="Motif de la correction" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={save} loading={loading} disabled={reason.trim().length < 3}>
            Enregistrer la correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
