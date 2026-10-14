"use client";
import { PackageCheck, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { computeDocumentTotals, formatMoney } from "@/lib/money";

type Option = { value: string; label: string };

export function PurchaseOrderForm({ suppliers, products, initial, orderId }: { suppliers: Option[]; products: Option[]; initial?: { supplierId: string; expectedAt: string; notes: string; lines: { productId: string; quantityOrdered: string; unitCost: string }[] }; orderId?: string }) {
  const router = useRouter();
  const [supplierId, setSupplier] = useState(initial?.supplierId ?? "");
  const [expectedAt, setExpected] = useState(initial?.expectedAt ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState(initial?.lines ?? [{ productId: "", quantityOrdered: "1", unitCost: "0" }]);
  const [saving, setSaving] = useState(false);
  let total = "0.00";
  try {
    total = computeDocumentTotals(lines.map((l) => ({ quantity: l.quantityOrdered || "0", unitPrice: (l.unitCost || "0").replace(",", "."), vatRate: "0" }))).totalExclTax;
  } catch {
    total = "—";
  }
  const save = async () => {
    setSaving(true);
    try {
      const body = { supplierId, expectedAt: expectedAt || null, notes, supplierInvoiceRef: null, lines: lines.filter((l) => l.productId) };
      const r = orderId ? (await apiFetch(`/api/purchase-orders/${orderId}`, { method: "PUT", body }), { id: orderId }) : await apiFetch<{ id: string }>("/api/purchase-orders", { method: "POST", body });
      toast.success("Commande enregistrée");
      router.push(`/purchases/${r.id}`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          <Field label="Fournisseur" required>
            <NativeSelect value={supplierId} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">Choisir…</option>
              {suppliers.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Livraison attendue">
            <Input type="date" value={expectedAt} onChange={(e) => setExpected(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Lignes</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setLines([...lines, { productId: "", quantityOrdered: "1", unitCost: "0" }])}>
            <Plus /> Ligne
          </Button>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produit</TableHead>
              <TableHead className="w-28 text-right">Quantité</TableHead>
              <TableHead className="w-36 text-right">Coût unitaire HT</TableHead>
              <TableHead className="sr-only">Supprimer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell>
                  <NativeSelect aria-label={`Produit ligne ${i + 1}`} value={l.productId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}>
                    <option value="">Choisir…</option>
                    {products.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  <Input aria-label={`Quantité ligne ${i + 1}`} type="number" min={1} className="text-right" value={l.quantityOrdered} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantityOrdered: e.target.value } : x)))} />
                </TableCell>
                <TableCell>
                  <Input aria-label={`Coût ligne ${i + 1}`} inputMode="decimal" className="text-right" value={l.unitCost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x)))} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon-sm" aria-label="Supprimer la ligne" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <CardContent className="flex justify-end pt-4 text-sm font-semibold">Total HT : {total === "—" ? "—" : formatMoney(total)}</CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => history.back()}>
          Annuler
        </Button>
        <Button loading={saving} disabled={!supplierId || !lines.some((l) => l.productId)} onClick={save}>
          Enregistrer le brouillon
        </Button>
      </div>
    </div>
  );
}

/** Réception (partielle ou totale) : seule opération qui augmente le stock. */
export function ReceiveDialog({ orderId, lines, locations }: { orderId: string; lines: { id: string; name: string; remaining: number; defaultLocationId: string | null }[]; locations: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pending = lines.filter((l) => l.remaining > 0);
  const [rows, setRows] = useState(() => Object.fromEntries(pending.map((l) => [l.id, { quantity: String(l.remaining), locationId: l.defaultLocationId ?? locations[0]?.value ?? "" }])));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const save = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/purchase-orders/${orderId}/receive`, { method: "POST", body: { notes, lines: pending.map((l) => ({ lineId: l.id, quantity: Number(rows[l.id]!.quantity), locationId: rows[l.id]!.locationId })) } });
      toast.success("Réception enregistrée : stock mis à jour");
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
        <Button size="sm">
          <PackageCheck /> Réceptionner
        </Button>
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Réception de marchandises</DialogTitle>
          <DialogDescription>Saisissez les quantités réellement reçues. Le stock n&apos;augmente qu&apos;à cette étape.</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produit</TableHead>
              <TableHead className="text-right">Restant</TableHead>
              <TableHead className="w-24 text-right">Reçu</TableHead>
              <TableHead>Rangement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.name}</TableCell>
                <TableCell className="text-right">{l.remaining}</TableCell>
                <TableCell>
                  <Input aria-label={`Reçu ${l.name}`} type="number" min={0} max={l.remaining} className="text-right" value={rows[l.id]!.quantity} onChange={(e) => setRows({ ...rows, [l.id]: { ...rows[l.id]!, quantity: e.target.value } })} />
                </TableCell>
                <TableCell>
                  <NativeSelect aria-label={`Rangement ${l.name}`} value={rows[l.id]!.locationId} onChange={(e) => setRows({ ...rows, [l.id]: { ...rows[l.id]!, locationId: e.target.value } })}>
                    {locations.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Field label="Notes (bon de livraison, réserves…)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button onClick={save} loading={loading}>
            Valider la réception
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
