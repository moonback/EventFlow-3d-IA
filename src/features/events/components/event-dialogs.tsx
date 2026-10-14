"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { ListPlus, MessageSquarePlus, Receipt, Truck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { useApiSubmit } from "@/components/forms/use-api-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { expenseCategoryLabels, eventStatusLabels } from "@/lib/labels";
import { expenseSchema } from "@/features/invoices/schemas";
import { eventNoteSchema, EVENT_STATUSES, taskSchema } from "../schemas";

type Option = { value: string; label: string };
interface Conflict {
  kind: string;
  message: string;
}

/** Saisie d'une période : champs datetime-local interprétés dans le fuseau du navigateur → ISO. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");
const toLocal = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function ConflictList({ conflicts }: { conflicts: Conflict[] }) {
  if (conflicts.length === 0) return <Alert tone="success">Aucun conflit détecté sur cette période.</Alert>;
  return (
    <Alert tone="warning" title={`${conflicts.length} conflit(s) détecté(s)`}>
      <ul className="mt-1 list-disc pl-4">
        {conflicts.map((c, i) => (
          <li key={i}>{c.message}</li>
        ))}
      </ul>
    </Alert>
  );
}

export function ChangeStatusDialog({ eventId, current, onDone }: { eventId: string; current: string; onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(current);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const save = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/events/${eventId}/status`, { method: "POST", body: { status, reason } });
      toast.success("Statut mis à jour");
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
          Changer le statut
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Statut de l&apos;événement</DialogTitle>
          <DialogDescription>L&apos;annulation libère les réservations non expédiées et les affectations.</DialogDescription>
        </DialogHeader>
        <Field label="Nouveau statut">
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {eventStatusLabels[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {status === "CANCELLED" ? (
          <Field label="Motif d'annulation" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        ) : null}
        {status === "CANCELLED" ? <Alert tone="warning">Action importante : les réservations seront annulées et le matériel préparé remis en rayon.</Alert> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={save} loading={loading} variant={status === "CANCELLED" ? "destructive" : "default"} disabled={status === current}>
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddNoteForm({ eventId }: { eventId: string }) {
  const form = useForm<z.input<typeof eventNoteSchema>>({ resolver: zodResolver(eventNoteSchema), defaultValues: { body: "" } });
  const { submit } = useApiSubmit(form.setError);
  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={form.handleSubmit(async (v) => {
        if (await submit(`/api/events/${eventId}/notes`, "POST", v, { success: "Note ajoutée" })) form.reset();
      })}
    >
      <Field label="Nouvelle note" error={form.formState.errors.body?.message}>
        <Textarea rows={3} placeholder="Informations utiles à l'équipe…" {...form.register("body")} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={form.formState.isSubmitting}>
          <MessageSquarePlus /> Ajouter la note
        </Button>
      </div>
    </form>
  );
}

export function AddTaskDialog({ eventId, staff }: { eventId?: string; staff: Option[] }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof taskSchema>>({ resolver: zodResolver(taskSchema), defaultValues: { title: "", description: "", eventId: eventId ?? "", assigneeId: "", priority: "NORMAL", dueAt: "" } });
  const { submit } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ListPlus /> Tâche
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle tâche</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            const body = { ...v, dueAt: v.dueAt ? toIso(String(v.dueAt)) : null };
            if (await submit("/api/tasks", "POST", body, { success: "Tâche créée" })) {
              form.reset();
              setOpen(false);
            }
          })}
        >
          <Field label="Titre" error={e.title?.message} required className="sm:col-span-2">
            <Input {...form.register("title")} />
          </Field>
          <Field label="Responsable" error={e.assigneeId?.message}>
            <NativeSelect {...form.register("assigneeId")}>
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Priorité">
            <NativeSelect {...form.register("priority")}>
              <option value="LOW">Basse</option>
              <option value="NORMAL">Normale</option>
              <option value="HIGH">Haute</option>
              <option value="URGENT">Urgente</option>
            </NativeSelect>
          </Field>
          <Field label="Échéance" error={e.dueAt?.message} className="sm:col-span-2">
            <Input type="datetime-local" {...form.register("dueAt")} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea rows={3} {...form.register("description")} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={form.formState.isSubmitting}>
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function usePreview(url: string, body: Record<string, unknown> | null) {
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [extra, setExtra] = useState<Record<string, unknown> | null>(null);
  const key = JSON.stringify(body);
  useEffect(() => {
    if (!body) {
      setConflicts(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<{ conflicts: Conflict[] } & Record<string, unknown>>(url, { method: "POST", body, signal: ctrl.signal });
        setConflicts(r.conflicts);
        setExtra(r);
      } catch {
        setConflicts(null);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);
  return { conflicts, extra };
}

/** Les prestataires externes reçoivent une proposition à accepter plutôt qu'une affectation directe. */
const PROPOSED_BY_DEFAULT = new Set(["FREELANCE", "INTERMITTENT"]);

export function AssignStaffDialog({ eventId, staff, skills, defaultStart, defaultEnd }: { eventId: string; staff: (Option & { employmentType?: string })[]; skills: Option[]; defaultStart: string; defaultEnd: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [staffId, setStaffIdState] = useState("");
  const [propose, setPropose] = useState(false);
  const setStaffId = (id: string) => {
    setStaffIdState(id);
    setPropose(PROPOSED_BY_DEFAULT.has(staff.find((s) => s.value === id)?.employmentType ?? ""));
  };
  const [role, setRole] = useState("");
  const [requiredSkillId, setSkill] = useState("");
  const [start, setStart] = useState(toLocal(defaultStart));
  const [end, setEnd] = useState(toLocal(defaultEnd));
  const [loading, setLoading] = useState(false);
  const ready = staffId && start && end;
  const body = ready ? { eventId, staffId, role: role || "Équipe", requiredSkillId: requiredSkillId || null, startAt: toIso(start), endAt: toIso(end), propose } : null;
  const { conflicts } = usePreview("/api/staff-assignments/preview", open ? body : null);
  const save = async () => {
    setLoading(true);
    try {
      await apiFetch("/api/staff-assignments", { method: "POST", body: { ...body, role } });
      if (propose) {
        // Envoi du lien du portail : le prestataire accepte ou refuse en ligne
        const portal = await apiFetch<{ mail: { status: string } | null }>(`/api/staff/${staffId}/portal-link`, { method: "POST" }).catch(() => null);
        const sent = portal?.mail && (portal.mail.status === "sent" || portal.mail.status === "stored");
        toast.success(sent ? "Proposition envoyée par e-mail" : "Proposition créée — envoyez le lien du portail depuis la fiche du collaborateur");
      } else {
        toast.success("Collaborateur affecté");
      }
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
        <Button size="sm" variant="outline">
          <UserPlus /> Affecter
        </Button>
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Affecter un collaborateur</DialogTitle>
          <DialogDescription>Disponibilités, missions existantes et compétences sont vérifiées par le serveur.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Collaborateur" required>
            <NativeSelect value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Choisir…</option>
              {staff.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Rôle sur l'événement" required>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="ex. Technicien son" />
          </Field>
          <Field label="Compétence exigée">
            <NativeSelect value={requiredSkillId} onChange={(e) => setSkill(e.target.value)}>
              <option value="">Aucune</option>
              {skills.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox checked={propose} onCheckedChange={(v) => setPropose(v === true)} />
            Proposer la mission (confirmée après acceptation du prestataire)
          </label>
          <Field label="Début" required>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Fin" required>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {conflicts ? <ConflictList conflicts={conflicts} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={save} loading={loading} disabled={!ready || !role || (conflicts?.length ?? 0) > 0}>
            {propose ? "Proposer" : "Affecter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignVehicleDialog({ eventId, vehicles, drivers, defaultStart, defaultEnd }: { eventId: string; vehicles: Option[]; drivers: Option[]; defaultStart: string; defaultEnd: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [start, setStart] = useState(toLocal(defaultStart));
  const [end, setEnd] = useState(toLocal(defaultEnd));
  const [purpose, setPurpose] = useState("");
  const [load, setLoad] = useState("");
  const [km, setKm] = useState("");
  const [loading, setLoading] = useState(false);
  const ready = vehicleId && start && end;
  const body = ready ? { eventId, vehicleId, driverId: driverId || null, startAt: toIso(start), endAt: toIso(end), purpose, loadWeightKg: load || null, loadVolumeM3: null, distanceKm: km || null } : null;
  const { conflicts, extra } = usePreview("/api/vehicle-assignments/preview", open ? body : null);
  const estimated = extra?.estimatedLoad as { weightKg: string; volumeM3: string; linesWithoutWeight: number } | undefined;
  const save = async () => {
    setLoading(true);
    try {
      await apiFetch("/api/vehicle-assignments", { method: "POST", body });
      toast.success("Véhicule affecté");
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
        <Button size="sm" variant="outline">
          <Truck /> Affecter un véhicule
        </Button>
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Affecter un véhicule</DialogTitle>
          <DialogDescription>Doubles affectations, entretiens, permis du chauffeur et capacité sont contrôlés.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Véhicule" required>
            <NativeSelect value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Choisir…</option>
              {vehicles.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Chauffeur">
            <NativeSelect value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">—</option>
              {drivers.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Départ" required>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Retour" required>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Charge (kg)" hint={estimated ? `Estimation du matériel réservé : ${estimated.weightKg} kg${estimated.linesWithoutWeight ? ` (${estimated.linesWithoutWeight} réf. sans poids)` : ""}` : undefined}>
            <Input inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value)} />
          </Field>
          <Field label="Distance aller-retour (km)">
            <Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
          </Field>
          <Field label="Objet" className="sm:col-span-2">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="ex. Livraison son et lumière" />
          </Field>
        </div>
        {conflicts ? <ConflictList conflicts={conflicts} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={save} loading={loading} disabled={!ready || (conflicts?.length ?? 0) > 0}>
            Affecter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddExpenseDialog({ eventId, vehicleId }: { eventId?: string; vehicleId?: string }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { category: "OTHER", description: "", amountExclTax: "", vatRate: "20", incurredAt: new Date().toISOString().slice(0, 10), eventId: eventId ?? null, vehicleId: vehicleId ?? null, supplierId: null, supplierInvoiceRef: "" },
  });
  const { submit } = useApiSubmit(form.setError);
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Receipt /> Dépense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle dépense</DialogTitle>
          <DialogDescription>Coût réel rattaché (montant HT).</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            if (await submit("/api/expenses", "POST", v, { success: "Dépense enregistrée" })) {
              form.reset();
              setOpen(false);
            }
          })}
        >
          <Field label="Catégorie" required>
            <NativeSelect {...form.register("category")}>
              {Object.entries(expenseCategoryLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Date" error={e.incurredAt?.message} required>
            <Input type="date" {...form.register("incurredAt")} />
          </Field>
          <Field label="Description" error={e.description?.message} required className="sm:col-span-2">
            <Input {...form.register("description")} />
          </Field>
          <Field label="Montant HT (€)" error={e.amountExclTax?.message} required>
            <Input inputMode="decimal" {...form.register("amountExclTax")} />
          </Field>
          <Field label="TVA (%)" error={e.vatRate?.message}>
            <Input inputMode="decimal" {...form.register("vatRate")} />
          </Field>
          <Field label="Réf. facture fournisseur" className="sm:col-span-2">
            <Input {...form.register("supplierInvoiceRef")} />
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

