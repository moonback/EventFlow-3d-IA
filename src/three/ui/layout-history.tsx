"use client";
import { History, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch, errorMessage } from "@/lib/api-client";

interface Version {
  id: string;
  label: string;
  createdByName: string | null;
  objectCount: number;
  createdAt: string;
}

/** Historique des versions de l'agencement 3D, avec retour à une version antérieure. */
export function LayoutHistory({ onRestored }: { onRestored: () => void }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVersions(null);
    setConfirm(null);
    apiFetch<Version[]>("/api/scene/versions")
      .then(setVersions)
      .catch((e) => {
        toast.error(errorMessage(e));
        setVersions([]);
      });
  }, [open]);

  const restore = async (v: Version) => {
    setBusy(v.id);
    try {
      await apiFetch(`/api/scene/versions/${v.id}/restore`, { method: "POST" });
      toast.success(`Agencement restauré : ${v.label}`);
      setOpen(false);
      onRestored();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <History /> Historique
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Versions de l&apos;agencement</DialogTitle>
            <DialogDescription>Chaque enregistrement crée une version. Restaurer remet toutes les positions dans l&apos;état choisi (une nouvelle version est créée, rien n&apos;est perdu).</DialogDescription>
          </DialogHeader>
          {versions === null ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Chargement…
            </p>
          ) : versions.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Aucune version : l&apos;agencement n&apos;a encore jamais été modifié.</p>
          ) : (
            <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {versions.map((v, i) => (
                <li key={v.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {v.label} {i === 0 ? <span className="text-xs font-normal text-success">· actuelle</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmt.format(new Date(v.createdAt))}
                      {v.createdByName ? ` · ${v.createdByName}` : ""} · {v.objectCount} objet(s) placé(s)
                    </p>
                  </div>
                  {i > 0 ? (
                    confirm === v.id ? (
                      <Button size="sm" variant="destructive" loading={busy === v.id} onClick={() => void restore(v)}>
                        Confirmer
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setConfirm(v.id)}>
                        <RotateCcw /> Restaurer
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
