"use client";
import { ClipboardCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Row = { productId: string; sku: string; name: string; expected: number };

/** Inventaire d'un emplacement : saisie des quantités comptées ; chaque écart produit un ajustement justifié. */
export function StockCountForm({ locations, locationId, rows, products }: { locations: { value: string; label: string }[]; locationId: string | null; rows: Row[]; products: { value: string; label: string; sku: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [lines, setLines] = useState<(Row & { counted: string })[]>(rows.map((r) => ({ ...r, counted: String(r.expected) })));
  const [reason, setReason] = useState("");
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const diffs = lines.filter((l) => l.counted !== "" && Number(l.counted) !== l.expected);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ adjustments: unknown[] }>("/api/stock/counts", { method: "POST", body: { locationId, reason, counts: lines.filter((l) => l.counted !== "").map((l) => ({ productId: l.productId, countedQuantity: Number(l.counted) })) } });
      toast.success(`${res.adjustments.length} ajustement(s) enregistré(s)`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Emplacement à inventorier" className="max-w-md">
        <NativeSelect
          value={locationId ?? ""}
          onChange={(e) => {
            const next = new URLSearchParams(params.toString());
            next.set("locationId", e.target.value);
            router.push(`${pathname}?${next.toString()}`);
          }}
        >
          <option value="">Choisir…</option>
          {locations.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {locationId ? (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="text-right">Attendu</TableHead>
                  <TableHead className="w-36 text-right">Compté</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => {
                  const delta = l.counted === "" ? 0 : Number(l.counted) - l.expected;
                  return (
                    <TableRow key={l.productId}>
                      <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                      <TableCell>{l.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.expected}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          className="ml-auto h-8 w-24 text-right"
                          aria-label={`Quantité comptée ${l.name}`}
                          value={l.counted}
                          onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, counted: e.target.value } : x)))}
                        />
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>{delta > 0 ? `+${delta}` : delta}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Ajouter une référence trouvée sur place" className="min-w-64 flex-1">
              <NativeSelect value={extra} onChange={(e) => setExtra(e.target.value)}>
                <option value="">Choisir…</option>
                {products
                  .filter((p) => !lines.some((l) => l.productId === p.value))
                  .map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Button
              variant="outline"
              disabled={!extra}
              onClick={() => {
                const p = products.find((x) => x.value === extra)!;
                setLines([...lines, { productId: p.value, sku: p.sku, name: p.name, expected: 0, counted: "0" }]);
                setExtra("");
              }}
            >
              Ajouter
            </Button>
          </div>
          {diffs.length ? <Alert tone="warning" title={`${diffs.length} écart(s) à justifier`}>Les écarts seront enregistrés comme ajustements d&apos;inventaire tracés avec le motif ci-dessous.</Alert> : <Alert tone="success">Aucun écart avec le stock théorique.</Alert>}
          <Field label="Motif / référence de l'inventaire" required className="max-w-xl">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. Inventaire tournant octobre" />
          </Field>
          <div>
            <Button onClick={submit} loading={loading} disabled={reason.trim().length < 3 || diffs.length === 0}>
              <ClipboardCheck /> Valider l&apos;inventaire
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
