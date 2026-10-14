"use client";
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, MapPin, Play, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChangeStatusDialog } from "@/features/events/components/event-dialogs";
import { MovementDialog, SendToMaintenanceDialog } from "@/features/inventory/components/stock-dialogs";
import type { LoadingSimulation, SceneItem } from "@/features/scene/types";
import { VehicleMaintenanceDialog } from "@/features/vehicles/components/vehicle-maintenance-dialog";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { movementTypeLabels, reservationStatusLabels } from "@/lib/labels";
import { STATUS_COLORS, STATUS_LABELS } from "../materials/palette";
import { loadColor } from "../objects/vehicle";
import { POSTIT_COLORS } from "../objects/week-board";

type PanelTarget = { kind: string; id: string };

interface StockSummary {
  total: number;
  inStorage: number;
  inPreparation: number;
  inReturn: number;
  inTransit: number;
  damaged: number;
  inMaintenance: number;
  reserved: number;
  availableNow: number;
}

// Réponses typées du endpoint /api/scene/objects/:kind/:id
type LocationPanel = { kind: "STOCK_LOCATION"; location: { id: string; code: string; name: string; kindLabel: string }; contents: { id: string; sku: string; name: string; quantity: number; category: { name: string; color: string } }[]; href: string };
type ProductPanel = {
  kind: "PRODUCT";
  product: { id: string; sku: string; name: string; unit: string; stockManaged: boolean; photoUrl: string | null; category: { name: string; color: string }; balances: { quantity: number; location: { id: string; code: string; kind: string } }[] };
  summary: StockSummary | null;
  movements: { id: string; type: keyof typeof movementTypeLabels; quantity: number; occurredAt: string; reason: string | null; fromLocation: { code: string } | null; toLocation: { code: string } | null; user: { name: string } | null }[];
  actions: { transfer: boolean; maintenance: boolean };
  href: string;
};
type VehiclePanel = {
  kind: "VEHICLE";
  vehicle: { id: string; registration: string; brand: string; model: string; payloadKg: number | null; volumeM3: string | null; mileageKm: number; requiredLicense: string | null };
  opsLabel: string;
  alerts: { level: string; message: string }[];
  missions: { id: string; startAt: string; endAt: string; event: { id: string; reference: string; name: string }; driver: { firstName: string; lastName: string } | null }[];
  maintenances: { title: string; scheduledAt: string }[];
  actions: { changeStatus: boolean };
  loadingPlan: {
    event: string;
    eventName: string;
    vehicles: number;
    capacity: number | null;
    steps: { step: number; sku: string; name: string; category: string | null; color?: string | null; quantity: number; volume: number | null; zone: string }[];
  } | null;
  href: string;
};
type EventPanel = {
  kind: "EVENT";
  event: { id: string; reference: string; name: string; status: string; statusLabel: string; startAt: string; endAt: string; timezone: string; venue: string; customer: string };
  reservations: { id: string; reference: string; status: keyof typeof reservationStatusLabels }[];
  staffCount: number;
  vehicles: string[];
  openTasks: number;
  alerts: string[];
  actions: { changeStatus: boolean };
  href: string;
};
type PanelData = LocationPanel | ProductPanel | VehiclePanel | EventPanel;

const fmt = (iso: string, tz?: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/**
 * Panneau contextuel : charge les données réelles via le serveur (droits vérifiés), propose
 * les actions autorisées ; après chaque action confirmée par le serveur, la scène est rechargée.
 */
export function ScenePanel({ item, onClose, onChanged, onFocusLocation, locations, onSimulateLoading, onStartMeeting }: { item: SceneItem; onClose: () => void; onChanged: () => void; onFocusLocation: (locationId: string) => void; locations: { value: string; label: string }[]; onSimulateLoading?: (simulation: LoadingSimulation) => void; onStartMeeting?: (eventId: string) => void }) {
  const [stack, setStack] = useState<PanelTarget[]>([]);
  const target: PanelTarget = stack.at(-1) ?? { kind: item.kind, id: item.businessId };
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isScreen = !["STOCK_LOCATION", "VEHICLE", "EVENT", "PRODUCT"].includes(target.kind);

  const load = useCallback(async () => {
    if (isScreen) return;
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<PanelData>(`/api/scene/objects/${target.kind}/${target.id}`));
    } catch (e) {
      setError(errorMessage(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [target.kind, target.id, isScreen]);

  useEffect(() => {
    setStack([]);
  }, [item.key]);
  useEffect(() => {
    void load();
  }, [load]);

  const done = () => {
    void load();
    onChanged();
  };

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-popover/95 backdrop-blur" aria-label="Panneau contextuel">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div className="min-w-0">
          {stack.length ? (
            <button type="button" onClick={() => setStack(stack.slice(0, -1))} className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3" /> Retour
            </button>
          ) : null}
          <h2 className="truncate font-semibold">{stack.length && data?.kind === "PRODUCT" ? data.product.name : item.label}</h2>
          <p className="truncate text-xs text-muted-foreground">{stack.length ? "Matériel" : (item.sublabel ?? "")}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 text-xs">
            <span className="size-2 rounded-full" style={{ background: STATUS_COLORS[item.status] }} aria-hidden /> {STATUS_LABELS[item.status]}
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer le panneau">
          <X />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {loading && !data ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Chargement des données…
          </p>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {item.kind === "VEHICLE" && item.load && !stack.length ? (
          <div className="mb-3 rounded-lg border border-border p-3">
            <div className="flex items-baseline justify-between">
              <p className="font-medium">Chargement · {item.load.event}</p>
              <p className="font-semibold tabular-nums" style={{ color: loadColor(item.load.ratio) }}>
                {Math.round(item.load.ratio * 100)} %
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(item.load.ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Taux de chargement">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, item.load.ratio * 100)}%`, background: loadColor(item.load.ratio) }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {item.load.volume.toLocaleString("fr-FR")} m³ sur {item.load.capacity.toLocaleString("fr-FR")} m³
              {item.load.ratio > 1 ? " — surcharge : prévoir un véhicule supplémentaire" : ""}
            </p>
            {item.load.missingVolumes > 0 ? <p className="mt-1 text-xs text-warning">{item.load.missingVolumes} article(s) sans volume ni dimensions : chargement sous-estimé.</p> : null}
          </div>
        ) : null}

        {isScreen ? (
          <div className="flex flex-col gap-3">
            {item.meeting ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">Choisissez l&apos;événement à préparer : son dossier s&apos;affiche sur l&apos;écran de la salle et la caméra prend place à la table.</p>
                <ul className="flex flex-col gap-1.5" aria-label="Événements à préparer">
                  {item.meeting.events.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {e.reference} · {e.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{fmt(e.startAt)}</p>
                      </div>
                      {onStartMeeting ? (
                        <Button size="sm" variant="secondary" onClick={() => onStartMeeting(e.id)}>
                          <Play /> Réunion
                        </Button>
                      ) : null}
                    </li>
                  ))}
                  {item.meeting.events.length === 0 ? <li className="text-xs text-muted-foreground">Aucun événement dans les 30 prochains jours.</li> : null}
                </ul>
              </div>
            ) : null}
            {item.mailbox ? (
              <ul className="flex flex-col gap-1.5" aria-label="Devis envoyés">
                {item.mailbox.items.map((q) => (
                  <li key={q.id}>
                    <Link href={`/quotes/${q.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 hover:bg-accent">
                      <span className="min-w-0 truncate">
                        {q.number} · {q.customer}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {q.followUp ? <Badge tone="warning">À relancer</Badge> : null}
                        <span className="tabular-nums">{Number(q.amount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {item.safe ? (
              <ul className="flex flex-col gap-1.5" aria-label="Factures en retard">
                {item.safe.items.map((i) => (
                  <li key={i.id}>
                    <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 p-2 hover:bg-accent">
                      <span className="min-w-0 truncate">
                        {i.number} · {i.customer}
                        {i.dueDate ? <span className="block text-xs text-destructive">échue le {new Date(i.dueDate).toLocaleDateString("fr-FR")}</span> : null}
                      </span>
                      <span className="shrink-0 tabular-nums">{Number(i.amount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span>
                    </Link>
                  </li>
                ))}
                {item.safe.items.length === 0 ? <li className="text-xs text-muted-foreground">Aucune facture en retard.</li> : null}
              </ul>
            ) : null}
            {item.map ? (
              <ul className="flex flex-col gap-1.5" aria-label="Missions des véhicules">
                {item.map.missions.map((m) => (
                  <li key={m.vehicleKey} className="rounded-lg border border-border p-2.5">
                    <p className="font-medium">
                      <span className="font-mono">{m.vehicle}</span> · {m.onMission ? "en mission" : "affecté"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.event} · {m.eventName} → {m.city || "lieu inconnu"}
                      {m.precision === "department" ? " (position approximative : département)" : ""}
                    </p>
                  </li>
                ))}
                {item.map.missions.length === 0 ? <li className="text-xs text-muted-foreground">Aucun véhicule affecté sur 7 jours.</li> : null}
                <li className="text-[11px] text-muted-foreground">Position : ville de l&apos;événement. Les positions GPS réelles s&apos;afficheront ici quand un boîtier sera connecté.</li>
              </ul>
            ) : null}
            {item.week ? (
              <ol className="flex flex-col gap-2" aria-label="Planning de la semaine">
                {item.week.map((d, i) => (
                  <li key={d.day} className="rounded-lg border border-border p-2.5">
                    <p className="text-xs font-semibold text-muted-foreground capitalize">{i === 0 ? "Aujourd'hui" : d.label}</p>
                    {d.events.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucun événement</p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1">
                        {d.events.map((e) => (
                          <li key={e.id} className="flex items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: POSTIT_COLORS[e.status] ?? "#fde68a" }} aria-hidden />
                            <Link href={`/events/${e.id}`} className="truncate hover:underline">
                              {e.reference} · {e.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            ) : null}
            <dl className="flex flex-col gap-2">
              {(item.metrics ?? []).map((m) => (
                <div key={m.label} className="flex justify-between rounded-lg border border-border p-2.5">
                  <dt className="text-muted-foreground">{m.label}</dt>
                  <dd className="font-semibold">{m.value}</dd>
                </div>
              ))}
            </dl>
            <Button asChild>
              <Link href={item.href}>
                Ouvrir le module <ExternalLink />
              </Link>
            </Button>
          </div>
        ) : null}

        {data?.kind === "STOCK_LOCATION" ? (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground">
              {data.location.kindLabel} · {data.contents.length} référence(s) · {data.contents.reduce((a, c) => a + c.quantity, 0)} unité(s)
            </p>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {data.contents.length === 0 ? <li className="p-3 text-muted-foreground">Emplacement vide</li> : null}
              {data.contents.map((c) => (
                <li key={c.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 p-2.5 text-left hover:bg-accent" onClick={() => setStack([...stack, { kind: "PRODUCT", id: c.id }])}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="size-2 rounded-full" style={{ background: c.category.color }} /> {c.category.name} · {c.sku}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{c.quantity}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="outline" asChild>
              <Link href={data.href}>
                Fiche de l&apos;emplacement <ExternalLink />
              </Link>
            </Button>
          </div>
        ) : null}

        {data?.kind === "PRODUCT" ? (
          <div className="flex flex-col gap-3">
            {data.product.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.product.photoUrl} alt={data.product.name} className="aspect-video w-full rounded-lg object-cover" />
            ) : null}
            <p className="text-xs text-muted-foreground">
              Réf. <span className="font-mono">{data.product.sku}</span> · {data.product.category.name}
            </p>
            {data.summary ? (
              <dl className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["Total", data.summary.total, ""],
                    ["Disponible", data.summary.availableNow, "text-success"],
                    ["Réservé", data.summary.reserved, "text-primary"],
                    ["Préparation", data.summary.inPreparation, "text-warning"],
                    ["Transit / site", data.summary.inTransit, "text-info"],
                    ["Endommagé", data.summary.damaged, "text-destructive"],
                    ["Maintenance", data.summary.inMaintenance, "text-destructive"],
                    ["En retour", data.summary.inReturn, ""],
                    ["En rayon", data.summary.inStorage, ""],
                  ] as const
                ).map(([l, v, c]) => (
                  <div key={l} className="rounded-lg border border-border p-2">
                    <dt className="text-[11px] text-muted-foreground">{l}</dt>
                    <dd className={`text-base font-semibold tabular-nums ${c}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <Badge>Non géré en stock</Badge>
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Emplacements</p>
              <ul className="flex flex-wrap gap-1.5">
                {data.product.balances.map((b) => (
                  <li key={b.location.id}>
                    <button type="button" onClick={() => onFocusLocation(b.location.id)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-primary">
                      <MapPin className="size-3" /> {b.location.code} · {b.quantity}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.actions.transfer && data.product.stockManaged ? (
                <MovementDialog productId={data.product.id} locations={locations} balances={data.product.balances.filter((b) => b.location.kind !== "OUT").map((b) => ({ locationId: b.location.id, code: b.location.code, quantity: b.quantity }))} onDone={done} />
              ) : null}
              {data.actions.maintenance && data.product.stockManaged ? (
                <SendToMaintenanceDialog productId={data.product.id} balances={data.product.balances.filter((b) => ["WAREHOUSE", "ZONE", "RACK", "BIN", "RETURN"].includes(b.location.kind)).map((b) => ({ locationId: b.location.id, code: b.location.code, quantity: b.quantity }))} onDone={done} />
              ) : null}
              <Button size="sm" variant="outline" asChild>
                <Link href={data.href}>
                  Fiche <ExternalLink />
                </Link>
              </Button>
            </div>
            {data.movements.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Derniers mouvements</p>
                <ul className="flex flex-col gap-1.5 text-xs">
                  {data.movements.map((m) => (
                    <li key={m.id} className="rounded-md bg-muted/50 p-2">
                      <span className="font-medium">
                        {movementTypeLabels[m.type]} ×{m.quantity}
                      </span>{" "}
                      <span className="font-mono text-muted-foreground">
                        {m.fromLocation?.code ?? "—"} → {m.toLocation?.code ?? "—"}
                      </span>
                      <span className="block text-muted-foreground">
                        {fmt(m.occurredAt)} · {m.user?.name ?? "—"}
                        {m.reason ? ` · ${m.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {data?.kind === "VEHICLE" ? (
          <div className="flex flex-col gap-3">
            <p>
              <span className="font-mono">{data.vehicle.registration}</span> · {data.vehicle.brand} {data.vehicle.model}
            </p>
            <Badge tone="accent" className="self-start">
              {data.opsLabel}
            </Badge>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border p-2">
                <dt className="text-muted-foreground">Charge utile</dt>
                <dd className="font-semibold">{data.vehicle.payloadKg ? `${data.vehicle.payloadKg} kg` : "—"}</dd>
              </div>
              <div className="rounded-lg border border-border p-2">
                <dt className="text-muted-foreground">Volume</dt>
                <dd className="font-semibold">{data.vehicle.volumeM3 ? `${data.vehicle.volumeM3} m³` : "—"}</dd>
              </div>
              <div className="rounded-lg border border-border p-2">
                <dt className="text-muted-foreground">Kilométrage</dt>
                <dd className="font-semibold">{data.vehicle.mileageKm.toLocaleString("fr-FR")} km</dd>
              </div>
              <div className="rounded-lg border border-border p-2">
                <dt className="text-muted-foreground">Permis</dt>
                <dd className="font-semibold">{data.vehicle.requiredLicense ?? "—"}</dd>
              </div>
            </dl>
            {data.alerts.map((a, i) => (
              <Alert key={i} tone={a.level === "danger" ? "danger" : "warning"}>
                {a.message}
              </Alert>
            ))}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Missions à venir</p>
              {data.missions.length === 0 ? <p className="text-xs text-muted-foreground">Aucune mission planifiée.</p> : null}
              <ul className="flex flex-col gap-1.5 text-xs">
                {data.missions.map((m) => (
                  <li key={m.id}>
                    <Link href={`/events/${m.event.id}`} className="block rounded-md bg-muted/50 p-2 hover:bg-accent">
                      <span className="font-medium">{m.event.reference}</span> {m.event.name}
                      <span className="block text-muted-foreground">
                        {fmt(m.startAt)} → {fmt(m.endAt)}
                        {m.driver ? ` · ${m.driver.firstName} ${m.driver.lastName}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {data.loadingPlan && data.loadingPlan.steps.length ? (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Plan de chargement · {data.loadingPlan.event}</p>
                  {onSimulateLoading ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        onSimulateLoading({
                          vehicleKey: item.key,
                          event: data.loadingPlan!.event,
                          step: 0,
                          steps: data.loadingPlan!.steps.map((s) => ({ step: s.step, name: s.name, quantity: s.quantity, volume: s.volume, color: s.color ?? null, zone: s.zone })),
                        })
                      }
                    >
                      <Play /> Simuler
                    </Button>
                  ) : null}
                </div>
                <ol className="flex max-h-56 flex-col gap-1 overflow-y-auto text-xs">
                  {data.loadingPlan.steps.map((s) => (
                    <li key={s.sku} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
                      <span className="w-5 text-right font-semibold tabular-nums">{s.step}</span>
                      <span className="size-2 shrink-0 rounded-sm" style={{ background: s.color ?? "#818cf8" }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">
                        {s.name} × {s.quantity}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{s.zone}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Dernier chargé, premier déchargé : le matériel installé en premier sur le site est chargé près des portes.
                  {data.loadingPlan.vehicles > 1 ? ` Plan commun aux ${data.loadingPlan.vehicles} véhicules de l'événement.` : ""}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {data.actions.changeStatus ? <VehicleMaintenanceDialog vehicleId={data.vehicle.id} onDone={done} /> : null}
              <Button size="sm" variant="outline" asChild>
                <Link href={data.href}>
                  Fiche véhicule <ExternalLink />
                </Link>
              </Button>
            </div>
          </div>
        ) : null}

        {data?.kind === "EVENT" ? (
          <div className="flex flex-col gap-3">
            <p className="font-medium">{data.event.name}</p>
            <p className="text-xs text-muted-foreground">
              {data.event.customer} · {data.event.venue || "lieu à définir"}
            </p>
            <p className="text-xs">
              {fmt(data.event.startAt, data.event.timezone)} → {fmt(data.event.endAt, data.event.timezone)}
            </p>
            <Badge tone="accent" className="self-start">
              {data.event.statusLabel}
            </Badge>
            {data.alerts.length ? (
              <Alert tone="danger" title="Alertes">
                <ul className="list-disc pl-4">
                  {data.alerts.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <p className="flex items-center gap-1 text-xs text-success">
                <AlertTriangle className="size-3" /> Aucune alerte
              </p>
            )}
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-border p-2">
                <dt className="text-muted-foreground">Équipe</dt>
                <dd className="font-semibold">{data.staffCount}</dd>
              </div>
              <div className="rounded-lg border border-border p-2">
                <dt className="text-muted-foreground">Véhicules</dt>
                <dd className="font-semibold">{data.vehicles.length}</dd>
              </div>
              <div className="rounded-lg border border-border p-2">
                <dt className="text-muted-foreground">Tâches</dt>
                <dd className="font-semibold">{data.openTasks}</dd>
              </div>
            </dl>
            <ul className="flex flex-col gap-1 text-xs">
              {data.reservations.map((r) => (
                <li key={r.id}>
                  <Link href={`/reservations/${r.id}`} className="flex justify-between rounded-md bg-muted/50 p-2 hover:bg-accent">
                    {r.reference} <span className="text-muted-foreground">{reservationStatusLabels[r.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {data.actions.changeStatus ? <ChangeStatusDialog eventId={data.event.id} current={data.event.status} onDone={done} /> : null}
              <Button size="sm" variant="outline" asChild>
                <Link href={data.href}>
                  Dossier complet <ExternalLink />
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
