import { AlertTriangle, Download, Eye, PackageCheck, RotateCcw, Send, Truck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { reservationStatusLabels, reservationStatusTones } from "@/lib/labels";
import { pageContext } from "@/server/auth/page";
import { logisticsBoard } from "@/server/services/logistics-service";

export const metadata = { title: "Logistique" };

type Item = Awaited<ReturnType<typeof logisticsBoard>>["toPrepare"][number];

function Sheet({ id, type, label }: { id: string; type: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" asChild>
        <a href={`/api/reservations/${id}/sheet/${type}?inline=1`} target="_blank" rel="noopener" aria-label={`Aperçu ${label}`} title={label}>
          <Eye />
        </a>
      </Button>
      <Button variant="ghost" size="icon-sm" asChild>
        <a href={`/api/reservations/${id}/sheet/${type}`} aria-label={`Télécharger ${label}`} title={label}>
          <Download />
        </a>
      </Button>
    </span>
  );
}

function Column({ title, icon: Icon, items, empty, render }: { title: string; icon: typeof Truck; items: Item[]; empty: string; render: (i: Item) => ReactNode }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
        </CardTitle>
        <Badge>{items.length}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? <EmptyState title={empty} className="py-8" /> : items.map((i) => <div key={i.id} className="rounded-lg border border-border p-3">{render(i)}</div>)}
      </CardContent>
    </Card>
  );
}

function Head({ i }: { i: Item }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <Link href={`/reservations/${i.id}`} className="font-medium hover:underline">
          {i.reference}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          <Link href={`/events/${i.event.id}`} className="hover:underline">
            {i.event.name}
          </Link>
          {i.event.city ? ` · ${i.event.city}` : ""}
        </p>
      </div>
      <StatusBadge value={i.status} labels={reservationStatusLabels} tones={reservationStatusTones} />
    </div>
  );
}

function Vehicles({ i }: { i: Item }) {
  if (i.vehicles.length === 0) return <p className="mt-2 text-xs text-warning">Aucun véhicule affecté</p>;
  return (
    <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
      {i.vehicles.map((v) => (
        <li key={v.id} className="flex items-center gap-1.5">
          <Truck className="size-3" aria-hidden /> {v.registration}
          {v.driver ? ` · ${v.driver}` : ""} · {formatDateTime(v.startAt, i.event.timezone)}
        </li>
      ))}
    </ul>
  );
}

export default async function LogisticsPage() {
  const ctx = await pageContext("reservations:read");
  const board = await logisticsBoard(ctx);
  return (
    <>
      <PageHeader title="Logistique" description="Préparations, départs, matériel sur site et retours — 14 prochains jours. Bons de préparation, de livraison (checklist de chargement) et fiches de retour (checklist de déchargement) imprimables." />
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Column
          title="À préparer"
          icon={PackageCheck}
          items={board.toPrepare}
          empty="Rien à préparer"
          render={(i) => (
            <>
              <Head i={i} />
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Préparation ${i.reference}`}>
                  <div className="h-full bg-primary" style={{ width: `${i.progress}%` }} />
                </div>
                <span className="text-xs tabular-nums">
                  {i.prepared}/{i.requested}
                </span>
              </div>
              <p className={`mt-1 text-xs ${i.lateDeparture ? "text-destructive" : "text-muted-foreground"}`}>
                {i.lateDeparture ? <AlertTriangle className="mr-1 inline size-3" /> : null}À préparer avant {formatDateTime(i.prepDeadline, i.event.timezone)}
              </p>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                Bon de préparation <Sheet id={i.id} type="picking" label="Bon de préparation" />
              </div>
            </>
          )}
        />
        <Column
          title="Prêts à partir"
          icon={Send}
          items={board.ready}
          empty="Aucun départ prêt"
          render={(i) => (
            <>
              <Head i={i} />
              <p className="mt-1 text-xs text-muted-foreground">Départ prévu {formatDateTime(i.startAt, i.event.timezone)}</p>
              <Vehicles i={i} />
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                Checklist de chargement <Sheet id={i.id} type="delivery" label="Bon de livraison / checklist de chargement" />
              </div>
            </>
          )}
        />
        <Column
          title="Sur site"
          icon={Truck}
          items={board.onSite}
          empty="Aucun matériel sorti"
          render={(i) => (
            <>
              <Head i={i} />
              <p className="mt-1 text-xs text-muted-foreground">
                {i.outstanding} unité(s) dehors · retour prévu {formatDateTime(i.endAt, i.event.timezone)}
              </p>
              <Vehicles i={i} />
            </>
          )}
        />
        <Column
          title="Retours"
          icon={RotateCcw}
          items={board.returns}
          empty="Aucun retour attendu"
          render={(i) => (
            <>
              <Head i={i} />
              <p className={`mt-1 text-xs ${i.lateReturn ? "text-destructive" : "text-muted-foreground"}`}>
                {i.lateReturn ? <AlertTriangle className="mr-1 inline size-3" /> : null}
                {i.outstanding} unité(s) attendue(s) depuis le {formatDateTime(i.endAt, i.event.timezone)}
              </p>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                Checklist de déchargement <Sheet id={i.id} type="return" label="Fiche de retour" />
              </div>
            </>
          )}
        />
      </div>
    </>
  );
}
