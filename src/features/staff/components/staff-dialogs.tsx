"use client";
import { CalendarOff, Clock, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";

function useRun() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return {
    loading,
    run: async (url: string, body: unknown, ok: string) => {
      setLoading(true);
      try {
        await apiFetch(url, { method: "POST", body });
        toast.success(ok);
        router.refresh();
        return true;
      } catch (e) {
        toast.error(errorMessage(e));
        return false;
      } finally {
        setLoading(false);
      }
    },
  };
}

export function UnavailabilityDialog({ staffId }: { staffId: string }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<"UNAVAILABLE" | "AVAILABLE">("UNAVAILABLE");
  const { loading, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarOff /> Disponibilité
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Déclarer une période</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" className="sm:col-span-2" required>
            <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as "UNAVAILABLE" | "AVAILABLE")}>
              <option value="UNAVAILABLE">Indisponible (bloque les affectations)</option>
              <option value="AVAILABLE">Disponible (indicatif)</option>
            </NativeSelect>
          </Field>
          <Field label="Du" required>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Au" required>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Motif" className="sm:col-span-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Congés, autre mission…" />
          </Field>
        </div>
        <DialogFooter>
          <Button loading={loading} disabled={!start || !end} onClick={async () => (await run(`/api/staff/${staffId}/unavailability`, { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), reason, kind }, "Période enregistrée")) && setOpen(false)}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TimesheetDialog({ assignmentId, label }: { assignmentId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("8");
  const [notes, setNotes] = useState("");
  const { loading, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Saisir des heures — ${label}`}>
          <Clock /> Heures
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Heures réalisées — {label}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Heures" required>
            <Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          <Field label="Commentaire" className="sm:col-span-2">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button loading={loading} onClick={async () => (await run(`/api/staff-assignments/${assignmentId}/timesheets`, { workDate: date, hours, notes }, "Heures enregistrées")) && setOpen(false)}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SkillDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { loading, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus /> Compétence
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle compétence</DialogTitle>
        </DialogHeader>
        <Field label="Nom" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Accroche / rigging" />
        </Field>
        <DialogFooter>
          <Button loading={loading} disabled={!name} onClick={async () => (await run("/api/skills", { name }, "Compétence créée")) && (setOpen(false), setName(""))}>
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
