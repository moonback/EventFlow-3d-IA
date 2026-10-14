"use client";
import { ArrowDown, ArrowUp, LayoutGrid } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/misc";
import { apiFetch, errorMessage } from "@/lib/api-client";

const LABELS: Record<string, string> = {
  kpis: "Indicateurs clés",
  upcomingEvents: "Événements à venir",
  preparations: "Préparations",
  returns: "Retours attendus",
  tasks: "Tâches urgentes",
  stockAlerts: "Alertes matériel",
  vehicles: "Véhicules",
  quotes: "Devis en attente",
  invoices: "Factures impayées",
  activity: "Activité récente",
};

export function CustomizeDashboard({ all, selected }: { all: string[]; selected: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([...selected, ...all.filter((w) => !selected.includes(w))]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set(selected));
  const [saving, setSaving] = useState(false);
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };
  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/dashboard/widgets", { method: "PUT", body: { widgets: order.filter((w) => enabled.has(w)) } });
      toast.success("Tableau de bord enregistré");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutGrid /> Personnaliser
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Personnaliser le tableau de bord</DialogTitle>
          <DialogDescription>Choisissez les blocs affichés et leur ordre. Les blocs dépendent aussi de vos droits.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {order.map((w, i) => (
            <li key={w} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <Switch
                checked={enabled.has(w)}
                onCheckedChange={(c) => {
                  const next = new Set(enabled);
                  if (c) next.add(w);
                  else next.delete(w);
                  setEnabled(next);
                }}
                aria-label={`Afficher ${LABELS[w]}`}
              />
              <span className="flex-1 text-sm">{LABELS[w] ?? w}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter">
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="Descendre">
                <ArrowDown />
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={save} loading={saving}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
