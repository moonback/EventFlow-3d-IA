"use client";
import { PackageCheck, PackageMinus, RotateCcw, Send, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorMessage } from "@/lib/api-client";

export interface OpLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  prepared: number;
  shipped: number;
  outstanding: number;
  stockManaged: boolean;
  balances: { location: { id: string; code: string; name: string }; quantity: number }[];
  defaultLocationId: string | null;
}

function useAction() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const run = async (url: string, body: unknown, success: string) => {
    setLoading(true);
    try {
      await apiFetch(url, { method: "POST", body });
      toast.success(success);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setLoading(false);
    }
  };
  return { loading, run };
}

/** Préparation : prélèvement par emplacement (la préparation déplace du stock, elle n'en crée pas). */
export function PrepareDialog({ reservationId, lines }: { reservationId: string; lines: OpLine[] }) {
  const [open, setOpen] = useState(false);
  const pending = lines.filter((l) => l.stockManaged && l.quantity - l.prepared > 0);
  const [picks, setPicks] = useState(() =>
    Object.fromEntries(
      pending.map((l) => {
        const best = l.balances.find((b) => b.location.id === l.defaultLocationId && b.quantity > 0) ?? l.balances[0];
        return [l.productId, { from: best?.location.id ?? "", quantity: String(Math.min(l.quantity - l.prepared, best?.quantity ?? 0)) }];
      }),
    ),
  );
  const { loading, run } = useAction();
  const submit = async () => {
    const payload = pending.map((l) => ({ productId: l.productId, fromLocationId: picks[l.productId]!.from, quantity: Number(picks[l.productId]!.quantity) })).filter((p) => p.fromLocationId && p.quantity > 0);
    if (payload.length === 0) return toast.error("Aucune quantité à préparer");
    if (await run(`/api/reservations/${reservationId}/prepare`, { lines: payload }, "Préparation enregistrée")) setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={pending.length === 0}>
          <PackageCheck /> Préparer
        </Button>
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Préparation de la commande</DialogTitle>
          <DialogDescription>Le matériel est déplacé de son emplacement vers la zone de préparation (mouvement tracé).</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead className="text-right">Reste</TableHead>
              <TableHead>Prélever depuis</TableHead>
              <TableHead className="w-24 text-right">Qté</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((l) => (
              <TableRow key={l.productId}>
                <TableCell>
                  {l.name}
                  <span className="block font-mono text-xs text-muted-foreground">{l.sku}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.quantity - l.prepared}</TableCell>
                <TableCell>
                  <NativeSelect aria-label={`Emplacement ${l.name}`} value={picks[l.productId]!.from} onChange={(e) => setPicks({ ...picks, [l.productId]: { ...picks[l.productId]!, from: e.target.value } })}>
                    <option value="">—</option>
                    {l.balances.map((b) => (
                      <option key={b.location.id} value={b.location.id}>
                        {b.location.code} ({b.quantity})
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  <Input aria-label={`Quantité ${l.name}`} type="number" min={0} max={l.quantity - l.prepared} className="w-20 text-right" value={picks[l.productId]!.quantity} onChange={(e) => setPicks({ ...picks, [l.productId]: { ...picks[l.productId]!, quantity: e.target.value } })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={submit} loading={loading}>
            Valider la préparation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UnprepareDialog({ reservationId, lines, storage }: { reservationId: string; lines: OpLine[]; storage: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const prepared = lines.filter((l) => l.prepared - l.shipped > 0);
  const [rows, setRows] = useState(() => Object.fromEntries(prepared.map((l) => [l.productId, { to: l.defaultLocationId ?? storage[0]?.value ?? "", quantity: "0" }])));
  const { loading, run } = useAction();
  const submit = async () => {
    const payload = prepared.map((l) => ({ productId: l.productId, toLocationId: rows[l.productId]!.to, quantity: Number(rows[l.productId]!.quantity) })).filter((p) => p.quantity > 0);
    if (await run(`/api/reservations/${reservationId}/unprepare`, { lines: payload }, "Matériel remis en rayon")) setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={prepared.length === 0}>
          <Undo2 /> Remettre en rayon
        </Button>
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Remise en rayon</DialogTitle>
          <DialogDescription>Annule une partie de la préparation (erreur de prélèvement, besoin réduit).</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead className="text-right">Préparé</TableHead>
              <TableHead>Vers</TableHead>
              <TableHead className="w-24 text-right">Qté</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prepared.map((l) => (
              <TableRow key={l.productId}>
                <TableCell>{l.name}</TableCell>
                <TableCell className="text-right">{l.prepared - l.shipped}</TableCell>
                <TableCell>
                  <NativeSelect aria-label={`Destination ${l.name}`} value={rows[l.productId]!.to} onChange={(e) => setRows({ ...rows, [l.productId]: { ...rows[l.productId]!, to: e.target.value } })}>
                    {storage.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  <Input aria-label={`Quantité ${l.name}`} type="number" min={0} max={l.prepared - l.shipped} className="w-20 text-right" value={rows[l.productId]!.quantity} onChange={(e) => setRows({ ...rows, [l.productId]: { ...rows[l.productId]!, quantity: e.target.value } })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button onClick={submit} loading={loading}>
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShipDialog({ reservationId, lines }: { reservationId: string; lines: OpLine[] }) {
  const [open, setOpen] = useState(false);
  const [allowIncomplete, setAllow] = useState(false);
  const [notes, setNotes] = useState("");
  const { loading, run } = useAction();
  const missing = lines.filter((l) => l.stockManaged && l.prepared < l.quantity);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send /> Expédier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer l&apos;expédition</DialogTitle>
          <DialogDescription>Le matériel préparé sort du stock vers l&apos;emplacement « sorti » (transit / sur site).</DialogDescription>
        </DialogHeader>
        {missing.length ? (
          <>
            <Alert tone="warning" title="Préparation incomplète">
              <ul className="list-disc pl-4">
                {missing.map((m) => (
                  <li key={m.productId}>
                    {m.name} : {m.prepared}/{m.quantity}
                  </li>
                ))}
              </ul>
            </Alert>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={allowIncomplete} onCheckedChange={(c) => setAllow(c === true)} /> Expédier quand même (l&apos;anomalie sera signalée)
            </label>
          </>
        ) : (
          <Alert tone="success">Toutes les références sont préparées.</Alert>
        )}
        <Field label="Commentaire (facultatif)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button loading={loading} disabled={missing.length > 0 && !allowIncomplete} onClick={async () => (await run(`/api/reservations/${reservationId}/ship`, { allowIncomplete, notes: notes || undefined }, "Expédition enregistrée")) && setOpen(false)}>
            Confirmer le départ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Retour avec contrôle : quantités bonnes / endommagées par ligne ; le reste est considéré manquant. */
export function ReturnDialog({ reservationId, lines, returnLocations }: { reservationId: string; lines: OpLine[]; returnLocations: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const out = lines.filter((l) => l.outstanding > 0);
  const [rows, setRows] = useState(() => Object.fromEntries(out.map((l) => [l.productId, { good: String(l.outstanding), damaged: "0", anomaly: "" }])));
  const [location, setLocation] = useState(returnLocations[0]?.value ?? "");
  const [notes, setNotes] = useState("");
  const { loading, run } = useAction();
  const missingTotal = out.reduce((acc, l) => acc + Math.max(0, l.outstanding - Number(rows[l.productId]!.good) - Number(rows[l.productId]!.damaged)), 0);
  const submit = async () => {
    const payload = out.map((l) => ({ productId: l.productId, quantityGood: Number(rows[l.productId]!.good), quantityDamaged: Number(rows[l.productId]!.damaged), anomaly: rows[l.productId]!.anomaly || undefined }));
    if (await run(`/api/reservations/${reservationId}/return`, { lines: payload, returnLocationId: location || undefined, notes: notes || undefined }, "Retour enregistré")) setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <RotateCcw /> Enregistrer un retour
        </Button>
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Retour et contrôle du matériel</DialogTitle>
          <DialogDescription>Le matériel endommagé part en quarantaine (indisponible) et un ticket de maintenance est ouvert. Un retour partiel est possible.</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead className="text-right">Attendu</TableHead>
              <TableHead className="w-20 text-right">Bon état</TableHead>
              <TableHead className="w-20 text-right">Endommagé</TableHead>
              <TableHead>Anomalie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {out.map((l) => (
              <TableRow key={l.productId}>
                <TableCell>{l.name}</TableCell>
                <TableCell className="text-right tabular-nums">{l.outstanding}</TableCell>
                <TableCell>
                  <Input aria-label={`Bon état ${l.name}`} type="number" min={0} max={l.outstanding} className="w-20 text-right" value={rows[l.productId]!.good} onChange={(e) => setRows({ ...rows, [l.productId]: { ...rows[l.productId]!, good: e.target.value } })} />
                </TableCell>
                <TableCell>
                  <Input aria-label={`Endommagé ${l.name}`} type="number" min={0} max={l.outstanding} className="w-20 text-right" value={rows[l.productId]!.damaged} onChange={(e) => setRows({ ...rows, [l.productId]: { ...rows[l.productId]!, damaged: e.target.value } })} />
                </TableCell>
                <TableCell>
                  <Input aria-label={`Anomalie ${l.name}`} value={rows[l.productId]!.anomaly} onChange={(e) => setRows({ ...rows, [l.productId]: { ...rows[l.productId]!, anomaly: e.target.value } })} placeholder="ex. câble arraché" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Zone de réception">
            <NativeSelect value={location} onChange={(e) => setLocation(e.target.value)}>
              {returnLocations.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Notes de contrôle">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {missingTotal > 0 ? <Alert tone="warning">{missingTotal} unité(s) non retournée(s) : elles restent « sorties » et bloquées jusqu&apos;à leur retour ou une déclaration de perte.</Alert> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={submit} loading={loading}>
            Valider le retour
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LossDialog({ reservationId, lines }: { reservationId: string; lines: OpLine[] }) {
  const [open, setOpen] = useState(false);
  const out = lines.filter((l) => l.outstanding > 0);
  const [productId, setProductId] = useState(out[0]?.productId ?? "");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const { loading, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={out.length === 0}>
          <PackageMinus /> Déclarer une perte
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Déclarer une perte</DialogTitle>
          <DialogDescription>Sortie définitive du stock, tracée et valorisée dans la rentabilité de l&apos;événement.</DialogDescription>
        </DialogHeader>
        <Field label="Référence">
          <NativeSelect value={productId} onChange={(e) => setProductId(e.target.value)}>
            {out.map((l) => (
              <option key={l.productId} value={l.productId}>
                {l.name} ({l.outstanding} sortie(s))
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Quantité perdue">
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Motif" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="destructive" loading={loading} disabled={reason.trim().length < 3} onClick={async () => (await run(`/api/reservations/${reservationId}/loss`, { productId, quantity: Number(quantity), reason }, "Perte enregistrée")) && setOpen(false)}>
            Déclarer la perte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelReservationDialog({ reservationId }: { reservationId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { loading, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Annuler la réservation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annuler la réservation</DialogTitle>
          <DialogDescription>Le stock est libéré ; le matériel déjà préparé est automatiquement remis en rayon.</DialogDescription>
        </DialogHeader>
        <Field label="Motif d'annulation" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Retour
          </Button>
          <Button variant="destructive" loading={loading} disabled={reason.trim().length < 3} onClick={async () => (await run(`/api/reservations/${reservationId}/cancel`, { reason }, "Réservation annulée")) && setOpen(false)}>
            Confirmer l&apos;annulation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
