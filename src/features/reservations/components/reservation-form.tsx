"use client";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";

interface ProductOption {
  value: string;
  label: string;
  stockManaged: boolean;
  category: string;
}
interface EventOption {
  value: string;
  label: string;
  startAt: string;
}
interface Availability {
  productId: string;
  name: string;
  stockManaged: boolean;
  capacity: number | null;
  available: number | null;
  conflicts: { reservationId: string; reference: string; eventName: string; start: string; end: string; quantity: number }[];
}

const toLocal = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Création / modification d'une réservation multi-références avec contrôle de disponibilité
 * en direct (indicatif). La vérification qui fait foi a lieu au moment de la confirmation,
 * côté serveur, sous verrou transactionnel.
 */
export function ReservationForm({
  events,
  products,
  initial,
  reservationId,
  defaults,
}: {
  events: EventOption[];
  products: ProductOption[];
  initial?: { eventId: string; startAt: string; endAt: string; prepBufferHours: number; returnBufferHours: number; notes: string; lines: { productId: string; quantity: number }[] };
  reservationId?: string;
  defaults: { prepBufferHours: number; returnBufferHours: number; eventWindows: Record<string, { start: string; end: string }> };
}) {
  const router = useRouter();
  const [eventId, setEventId] = useState(initial?.eventId ?? "");
  const [start, setStart] = useState(initial ? toLocal(initial.startAt) : "");
  const [end, setEnd] = useState(initial ? toLocal(initial.endAt) : "");
  const [prep, setPrep] = useState(String(initial?.prepBufferHours ?? defaults.prepBufferHours));
  const [ret, setRet] = useState(String(initial?.returnBufferHours ?? defaults.returnBufferHours));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<{ productId: string; quantity: string }[]>(() => {
    const existing = initial?.lines.map((l) => ({ productId: l.productId, quantity: String(l.quantity) })) ?? [];
    return existing.length ? existing : [{ productId: "", quantity: "1" }];
  });
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shortages, setShortages] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId || initial) return;
    const w = defaults.eventWindows[eventId];
    if (w) {
      setStart(toLocal(w.start));
      setEnd(toLocal(w.end));
    }
  }, [eventId, defaults.eventWindows, initial]);

  const productIds = useMemo(() => [...new Set(lines.map((l) => l.productId).filter(Boolean))], [lines]);
  useEffect(() => {
    if (!start || !end || productIds.length === 0) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const params = new URLSearchParams({ productIds: productIds.join(","), startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() });
        if (reservationId) params.set("excludeReservationId", reservationId);
        const rows = await apiFetch<Availability[]>(`/api/inventory/availability?${params}`, { signal: ctrl.signal });
        setAvailability(Object.fromEntries(rows.map((r) => [r.productId, r])));
      } catch {
        /* contrôle indicatif */
      } finally {
        setChecking(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [productIds, start, end, reservationId]);

  const body = () => ({
    ...(reservationId ? {} : { eventId }),
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    prepBufferHours: Number(prep),
    returnBufferHours: Number(ret),
    notes: notes || undefined,
    lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
  });

  const save = async (confirm: boolean) => {
    setSaving(true);
    setShortages(null);
    try {
      const r = reservationId
        ? (await apiFetch(`/api/reservations/${reservationId}`, { method: "PATCH", body: body() }), { id: reservationId })
        : await apiFetch<{ id: string }>("/api/reservations", { method: "POST", body: body() });
      if (confirm) {
        try {
          await apiFetch(`/api/reservations/${r.id}/confirm`, { method: "POST", body: {} });
          toast.success("Réservation confirmée : le stock est bloqué");
        } catch (e) {
          toast.error(`Réservation enregistrée en brouillon, confirmation refusée : ${errorMessage(e)}`);
        }
      } else toast.success("Réservation enregistrée");
      router.push(`/reservations/${r.id}`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "INSUFFICIENT_AVAILABILITY") setShortages(e.message);
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const anyShortage = lines.some((l) => {
    const a = availability[l.productId];
    return a?.stockManaged && a.available !== null && Number(l.quantity) > a.available;
  });
  const valid = (reservationId || eventId) && start && end && lines.some((l) => l.productId) && lines.every((l) => !l.productId || Number(l.quantity) >= 1);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Période de réservation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!reservationId ? (
            <Field label="Événement" required className="sm:col-span-2 lg:col-span-4">
              <NativeSelect value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">Choisir un événement…</option>
                {events.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          <Field label="Début d'utilisation" required hint="Par défaut : début du montage">
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Fin d'utilisation" required hint="Par défaut : fin du démontage">
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Tampon préparation / transport (h)" hint="Bloque le stock avant le début">
            <Input type="number" min={0} max={720} value={prep} onChange={(e) => setPrep(e.target.value)} />
          </Field>
          <Field label="Tampon retour / contrôle (h)" hint="Bloque le stock après la fin">
            <Input type="number" min={0} max={720} value={ret} onChange={(e) => setRet(e.target.value)} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Matériel {checking ? <span className="ml-2 text-xs font-normal text-muted-foreground">vérification…</span> : null}</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setLines([...lines, { productId: "", quantity: "1" }])}>
            <Plus /> Ligne
          </Button>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-64">Référence</TableHead>
              <TableHead className="w-28 text-right">Quantité</TableHead>
              <TableHead className="text-right">Disponible sur la période</TableHead>
              <TableHead>Conflits</TableHead>
              <TableHead className="sr-only">Supprimer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => {
              const a = availability[l.productId];
              const short = a?.stockManaged && a.available !== null && Number(l.quantity) > a.available;
              return (
                <TableRow key={i}>
                  <TableCell>
                    <NativeSelect aria-label={`Référence ligne ${i + 1}`} value={l.productId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}>
                      <option value="">Choisir…</option>
                      {products.map((p) => (
                        <option key={p.value} value={p.value} disabled={lines.some((x, j) => j !== i && x.productId === p.value)}>
                          {p.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell>
                    <Input aria-label={`Quantité ligne ${i + 1}`} type="number" min={1} className="ml-auto w-24 text-right" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                  </TableCell>
                  <TableCell className="text-right">
                    {!a ? (
                      "—"
                    ) : !a.stockManaged ? (
                      <Badge>Non suivi</Badge>
                    ) : (
                      <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${short ? "text-destructive" : "text-success"}`}>
                        {short ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
                        {a.available} / {a.capacity}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-sm text-xs text-muted-foreground">
                    {a?.conflicts.length
                      ? a.conflicts.slice(0, 3).map((c) => (
                          <span key={c.reservationId} className="block truncate">
                            {c.reference} · {c.eventName} ×{c.quantity}
                          </span>
                        ))
                      : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" aria-label="Supprimer la ligne" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <Field label="Notes" className="max-w-2xl">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {shortages ? <Alert tone="danger" title="Stock insuffisant">{shortages}</Alert> : null}
      {anyShortage ? <Alert tone="warning" title="Disponibilité insuffisante sur la période">Vous pouvez enregistrer un brouillon (non bloquant) ; la confirmation sera refusée tant que le stock ne suffit pas.</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => history.back()}>
          Annuler
        </Button>
        <Button variant="secondary" loading={saving} disabled={!valid} onClick={() => save(false)}>
          Enregistrer {reservationId ? "" : "en brouillon"}
        </Button>
        {!reservationId ? (
          <Button loading={saving} disabled={!valid || anyShortage} onClick={() => save(true)}>
            Enregistrer et confirmer
          </Button>
        ) : null}
      </div>
    </div>
  );
}
