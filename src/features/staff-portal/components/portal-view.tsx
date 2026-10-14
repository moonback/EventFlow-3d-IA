"use client";
import { CalendarCheck, CalendarPlus, Check, MapPin, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/feedback/empty-state";
import { Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { formatDateTime, zonedLocalToUtc } from "@/lib/dates";
import { availabilityKindLabels } from "@/lib/labels";
import type { getPortalOverview } from "@/server/services/staff-portal-service";

type Overview = Awaited<ReturnType<typeof getPortalOverview>>;
type Mission = Overview["proposals"][number];

/** Appel d'API du portail : le jeton voyage dans un en-tête, jamais dans l'URL de l'API. */
async function portalFetch<T>(token: string, url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "X-Portal-Token": token },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { message: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Erreur ${res.status}`);
  return json.data as T;
}

export function PortalView({ token, initial }: { token: string; initial: Overview }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const tz = data.organization.timezone;

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      setData(await portalFetch<Overview>(token, "/api/portal"));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Une erreur est survenue");
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Bonjour {data.staffName}</h1>
        <p className="text-sm text-muted-foreground">Vos missions avec {data.organization.name}</p>
      </div>

      <section aria-labelledby="proposals-title" aria-live="polite">
        <h2 id="proposals-title" className="mb-3 flex items-center gap-2 text-base font-semibold">
          Propositions en attente {data.proposals.length ? <Badge tone="warning">{data.proposals.length}</Badge> : null}
        </h2>
        {data.proposals.length === 0 ? (
          <EmptyState title="Aucune proposition en attente" />
        ) : (
          <div className="flex flex-col gap-3">
            {data.proposals.map((m) => (
              <ProposalCard
                key={m.id}
                mission={m}
                tz={tz}
                busy={busy}
                onRespond={(decision, reason) => run(m.id, () => portalFetch(token, `/api/portal/assignments/${m.id}/response`, "POST", { decision, reason }), decision === "ACCEPT" ? "Mission acceptée" : "Mission refusée")}
              />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="size-4" aria-hidden /> Missions confirmées
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune mission à venir.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.upcoming.map((m) => (
                <li key={m.id} className="flex flex-col gap-0.5 py-2">
                  <span className="font-medium">
                    {m.event.name} <span className="text-muted-foreground">· {m.role}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatDateTime(m.startAt, tz)} → {formatDateTime(m.endAt, tz)}
                    {m.event.venueName ? ` · ${m.event.venueName}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AvailabilityCard
        data={data}
        busy={busy}
        onDeclare={(body) => run("declare", () => portalFetch(token, "/api/portal/availability", "POST", body), "Disponibilité enregistrée")}
        onDelete={(id) => run(id, () => portalFetch(token, `/api/portal/availability/${id}`, "DELETE"), "Période supprimée")}
      />
    </div>
  );
}

function ProposalCard({ mission: m, tz, busy, onRespond }: { mission: Mission; tz: string; busy: string | null; onRespond: (decision: "ACCEPT" | "DECLINE", reason: string | null) => Promise<boolean> }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const label = `${m.event.reference} — ${m.role}`;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {m.event.name} <Badge tone="warning">À confirmer</Badge>
          </p>
          <p className="text-sm">{m.role}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatDateTime(m.startAt, tz)} → {formatDateTime(m.endAt, tz)}
          </p>
          {m.event.venueName ? (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden /> {m.event.venueName}
            </p>
          ) : null}
        </div>
        {declining ? (
          <div className="flex flex-col gap-2">
            <Field label="Motif du refus (facultatif)">
              <Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" size="lg" loading={busy === m.id} onClick={() => onRespond("DECLINE", reason.trim() || null)} aria-label={`Confirmer le refus de la mission ${label}`}>
                <X /> Confirmer le refus
              </Button>
              <Button variant="ghost" size="lg" onClick={() => setDeclining(false)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="lg" loading={busy === m.id} disabled={busy !== null && busy !== m.id} onClick={() => onRespond("ACCEPT", null)} aria-label={`Accepter la mission ${label}`}>
              <Check /> Accepter
            </Button>
            <Button variant="outline" size="lg" disabled={busy !== null} onClick={() => setDeclining(true)} aria-label={`Refuser la mission ${label}`}>
              <X /> Refuser
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AvailabilityCard({ data, busy, onDeclare, onDelete }: { data: Overview; busy: string | null; onDeclare: (body: unknown) => Promise<boolean>; onDelete: (id: string) => Promise<boolean> }) {
  const tz = data.organization.timezone;
  const [kind, setKind] = useState<"AVAILABLE" | "UNAVAILABLE">("AVAILABLE");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end) return;
    // Heures saisies dans le fuseau de l'organisation, envoyées en UTC
    const ok = await onDeclare({ kind, startAt: zonedLocalToUtc(start, tz).toISOString(), endAt: zonedLocalToUtc(end, tz).toISOString(), reason: reason.trim() || null });
    if (ok) {
      setStart("");
      setEnd("");
      setReason("");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="size-4" aria-hidden /> Mes disponibilités
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" required>
            <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as "AVAILABLE" | "UNAVAILABLE")}>
              <option value="AVAILABLE">Disponible</option>
              <option value="UNAVAILABLE">Indisponible</option>
            </NativeSelect>
          </Field>
          <Field label="Commentaire">
            <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Début" required>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
          </Field>
          <Field label="Fin" required>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" loading={busy === "declare"} disabled={!start || !end}>
              Enregistrer
            </Button>
          </div>
        </form>
        {data.availabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune période déclarée.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {data.availabilities.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.kind === "AVAILABLE" ? "success" : "neutral"}>{availabilityKindLabels[a.kind]}</Badge>
                  <span className="tabular-nums">
                    {formatDateTime(a.startAt, tz)} → {formatDateTime(a.endAt, tz)}
                  </span>
                  {a.reason ? <span className="text-muted-foreground">· {a.reason}</span> : null}
                  {!a.editable ? <span className="text-xs text-muted-foreground">(saisie par la régie)</span> : null}
                </span>
                {a.editable ? (
                  <Button variant="ghost" size="icon" loading={busy === a.id} onClick={() => onDelete(a.id)} aria-label="Supprimer cette période">
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
