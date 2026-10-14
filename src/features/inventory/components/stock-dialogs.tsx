"use client";
import { ArrowLeftRight, Camera, PackagePlus, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Option = { value: string; label: string; kind?: string };
type MovementKind = "RECEIPT" | "TRANSFER" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "LOSS";

const TITLES: Record<MovementKind, string> = {
  RECEIPT: "Réception hors commande",
  TRANSFER: "Transfert entre emplacements",
  ADJUSTMENT_IN: "Ajustement d'inventaire (+)",
  ADJUSTMENT_OUT: "Ajustement d'inventaire (−)",
  LOSS: "Perte / mise au rebut",
};

/**
 * Saisie d'un mouvement manuel. Le serveur valide la cohérence (emplacements, solde suffisant)
 * et journalise ; l'écran n'est rafraîchi qu'après sa confirmation.
 */
export function MovementDialog({ productId, locations, balances, defaultType = "TRANSFER", trigger, onDone }: { productId: string; locations: Option[]; balances: { locationId: string; code: string; quantity: number }[]; defaultType?: MovementKind; trigger?: React.ReactNode; onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MovementKind>(defaultType);
  const [from, setFrom] = useState(balances[0]?.locationId ?? "");
  const [to, setTo] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const needsFrom = type === "TRANSFER" || type === "ADJUSTMENT_OUT" || type === "LOSS";
  const needsTo = type === "TRANSFER" || type === "RECEIPT" || type === "ADJUSTMENT_IN";
  const max = needsFrom ? balances.find((b) => b.locationId === from)?.quantity : undefined;
  const save = async () => {
    setLoading(true);
    try {
      await apiFetch("/api/stock/movements", { method: "POST", body: { type, productId, quantity, fromLocationId: needsFrom ? from : null, toLocationId: needsTo ? to : null, reason } });
      toast.success("Mouvement enregistré");
      setOpen(false);
      onDone?.();
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
        {trigger ?? (
          <Button size="sm" variant="outline">
            <ArrowLeftRight /> Mouvement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLES[type]}</DialogTitle>
          <DialogDescription>Chaque mouvement est tracé (date, utilisateur, motif) et ne peut être corrigé que par un mouvement compensatoire.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type de mouvement" className="sm:col-span-2">
            <NativeSelect value={type} onChange={(e) => setType(e.target.value as MovementKind)}>
              {Object.entries(TITLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {needsFrom ? (
            <Field label="Depuis" required>
              <NativeSelect value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Choisir…</option>
                {balances.map((b) => (
                  <option key={b.locationId} value={b.locationId}>
                    {b.code} ({b.quantity} dispo. sur place)
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {needsTo ? (
            <Field label="Vers" required>
              <NativeSelect value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choisir…</option>
                {locations
                  .filter((l) => l.value !== from)
                  .map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
          ) : null}
          <Field label="Quantité" required hint={max !== undefined ? `Maximum ${max}` : undefined}>
            <Input type="number" min={1} max={max} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Motif" required={type !== "TRANSFER"} className="sm:col-span-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === "LOSS" ? "ex. casse lors du montage" : ""} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={save} loading={loading} variant={type === "LOSS" || type === "ADJUSTMENT_OUT" ? "destructive" : "default"} disabled={(needsFrom && !from) || (needsTo && !to) || Number(quantity) < 1}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SendToMaintenanceDialog({ productId, balances, onDone }: { productId: string; balances: { locationId: string; code: string; quantity: number }[]; onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(balances[0]?.locationId ?? "");
  const [quantity, setQuantity] = useState("1");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const save = async () => {
    setLoading(true);
    try {
      await apiFetch("/api/maintenance", { method: "POST", body: { productId, fromLocationId: from, quantity, title, description: null } });
      toast.success("Matériel envoyé en maintenance (indisponible)");
      setOpen(false);
      onDone?.();
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
        <Button size="sm" variant="outline">
          <Wrench /> Maintenance
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer en maintenance</DialogTitle>
          <DialogDescription>Le matériel devient indisponible jusqu&apos;à sa remise en état validée.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Depuis" required>
            <NativeSelect value={from} onChange={(e) => setFrom(e.target.value)}>
              {balances.map((b) => (
                <option key={b.locationId} value={b.locationId}>
                  {b.code} ({b.quantity})
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Quantité" required>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Problème constaté" required className="sm:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={save} loading={loading} disabled={!from || title.length < 1}>
            Envoyer en atelier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PhotoUpload({ productId }: { productId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("target", "product-photo");
    fd.append("targetId", productId);
    setLoading(true);
    try {
      await apiFetch("/api/documents", { method: "POST", body: fd });
      toast.success("Photo mise à jour");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choisir une photo" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      <Button size="sm" variant="outline" loading={loading} onClick={() => input.current?.click()}>
        <Camera /> Photo
      </Button>
    </>
  );
}

export function AddAssetDialog({ productId, locations }: { productId: string; locations: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serial, setSerial] = useState("");
  const [loc, setLoc] = useState("");
  const [loading, setLoading] = useState(false);
  const save = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/inventory/products/${productId}/assets`, { method: "POST", body: { serialNumber: serial, locationId: loc || null } });
      toast.success("Unité ajoutée");
      setOpen(false);
      setSerial("");
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
        <Button size="sm" variant="outline">
          <PackagePlus /> Unité
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle unité sérialisée</DialogTitle>
          <DialogDescription>Identification individuelle (le stock reste géré en quantité via les mouvements).</DialogDescription>
        </DialogHeader>
        <Field label="Numéro de série" required>
          <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
        </Field>
        <Field label="Emplacement">
          <NativeSelect value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <DialogFooter>
          <Button onClick={save} loading={loading} disabled={!serial}>
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
