import { CalendarClock, FilePlus2, MapPin, PackagePlus, Pencil, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/feedback/action-button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatCard } from "@/components/feedback/stat-card";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsPanel } from "@/features/documents/components/documents-panel";
import { AddExpenseDialog, AddNoteForm, AddTaskDialog, AssignStaffDialog, AssignVehicleDialog, ChangeStatusDialog } from "@/features/events/components/event-dialogs";
import { TaskStatusSelect } from "@/features/events/components/task-status";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  assignmentStatusLabels,
  eventStatusLabels,
  eventStatusTones,
  expenseCategoryLabels,
  invoiceStatusLabels,
  invoiceStatusTones,
  quoteStatusLabels,
  quoteStatusTones,
  reservationStatusLabels,
  reservationStatusTones,
  taskPriorityLabels,
} from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getEvent } from "@/server/services/event-service";
import { getEventFinancials } from "@/server/services/finance-service";
import { listSkills, staffOptions } from "@/server/services/staff-service";
import { vehicleOptions } from "@/server/services/vehicle-service";

export const metadata = { title: "Événement" };

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("events:read");
  const { id } = await params;
  const e = await loadOr404(() => getEvent(ctx, id));
  const tz = e.timezone;
  const write = can(ctx, "events:write") && e.status !== "CANCELLED";
  const [fin, staff, skills, vehicles] = await Promise.all([
    can(ctx, "finance:read") ? getEventFinancials(ctx, id) : Promise.resolve(null),
    can(ctx, "staff:read") ? staffOptions(ctx) : Promise.resolve([]),
    can(ctx, "staff:read") ? listSkills(ctx) : Promise.resolve([]),
    can(ctx, "vehicles:read") ? vehicleOptions(ctx) : Promise.resolve([]),
  ]);
  const windowStart = e.setupStartAt ?? e.startAt;
  const windowEnd = e.teardownEndAt ?? e.endAt;
  const openTasks = e.tasks.filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS");

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {e.name}
            <StatusBadge value={e.status} labels={eventStatusLabels} tones={eventStatusTones} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{e.reference}</span>
            <Link href={`/customers/${e.customer.id}`} className="hover:underline">
              {e.customer.name}
            </Link>
            {e.eventType ? (
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: e.eventType.color }} aria-hidden /> {e.eventType.name}
              </span>
            ) : null}
          </span>
        }
        breadcrumbs={[{ label: "Événements", href: "/events" }, { label: e.reference }]}
        actions={
          <>
            {can(ctx, "quotes:write") && e.status !== "CANCELLED" ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/quotes/new?customerId=${e.customer.id}&eventId=${e.id}`}>
                  <FilePlus2 /> Devis
                </Link>
              </Button>
            ) : null}
            {can(ctx, "reservations:write") && e.status !== "CANCELLED" ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/reservations/new?eventId=${e.id}`}>
                  <PackagePlus /> Réserver du matériel
                </Link>
              </Button>
            ) : null}
            {write ? (
              <>
                <ChangeStatusDialog eventId={e.id} current={e.status} />
                {e.status !== "COMPLETED" ? (
                  <Button size="sm" asChild>
                    <Link href={`/events/${e.id}/edit`}>
                      <Pencil /> Modifier
                    </Link>
                  </Button>
                ) : null}
              </>
            ) : null}
          </>
        }
      />
      {e.status === "CANCELLED" && e.cancelledReason ? <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">Annulé : {e.cancelledReason}</p> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Début" value={<span className="text-base">{formatDateTime(e.startAt, tz)}</span>} hint={`Fin ${formatDateTime(e.endAt, tz)}`} icon={CalendarClock} tone="accent" />
        <StatCard label="Lieu" value={<span className="text-base">{e.venueName ?? "—"}</span>} hint={[e.addressLine1, e.postalCode, e.city].filter(Boolean).join(", ") || undefined} icon={MapPin} />
        <StatCard label="Équipe & véhicules" value={`${e.staffAssignments.length} · ${e.vehicleAssignments.length}`} hint="collaborateurs · véhicules affectés" icon={Users} />
        {fin ? (
          <StatCard label="Marge prévisionnelle" value={formatMoney(fin.marginForecast)} tone={Number(fin.marginForecast) >= 0 ? "success" : "danger"} hint={`CA prévu ${formatMoney(fin.revenueForecast)} · ${fin.marginRateForecast ?? "—"} %`} />
        ) : (
          <StatCard label="Tâches ouvertes" value={openTasks.length} tone={openTasks.length ? "warning" : "success"} />
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Aperçu</TabsTrigger>
          <TabsTrigger value="equipment">Matériel ({e.reservations.length})</TabsTrigger>
          <TabsTrigger value="team">Équipe ({e.staffAssignments.length})</TabsTrigger>
          <TabsTrigger value="vehicles">Véhicules ({e.vehicleAssignments.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tâches ({openTasks.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({e.notes.length})</TabsTrigger>
          {can(ctx, "documents:read") ? <TabsTrigger value="documents">Documents ({e.documents.length})</TabsTrigger> : null}
          {fin ? <TabsTrigger value="finance">Budget & rentabilité</TabsTrigger> : null}
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Informations</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Info label="Montage">{formatDateTime(e.setupStartAt, tz)}</Info>
                  <Info label="Démontage">{formatDateTime(e.teardownEndAt, tz)}</Info>
                  <Info label="Fuseau horaire">{tz}</Info>
                  <Info label="Invités">{e.guestCount ?? "—"}</Info>
                  <Info label="Responsable">{e.manager?.name ?? "—"}</Info>
                  <Info label="Budget client (HT)">{formatMoney(e.budgetAmount)}</Info>
                </dl>
                {e.description ? <p className="mt-4 rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{e.description}</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Documents commerciaux</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {e.quotes.length === 0 && e.invoices.length === 0 ? <p className="text-muted-foreground">Aucun devis ni facture.</p> : null}
                {e.quotes.map((q) => (
                  <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 hover:border-primary/40">
                    <span>
                      Devis {q.number}
                      <span className="block text-xs text-muted-foreground">{formatMoney(q.totalExclTax)} HT</span>
                    </span>
                    <StatusBadge value={q.status} labels={quoteStatusLabels} tones={quoteStatusTones} />
                  </Link>
                ))}
                {e.invoices.map((i) => (
                  <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 hover:border-primary/40">
                    <span>
                      {i.kind === "CREDIT_NOTE" ? "Avoir" : "Facture"} {i.number ?? "brouillon"}
                      <span className="block text-xs text-muted-foreground">{formatMoney(i.totalInclTax)} TTC</span>
                    </span>
                    <StatusBadge value={i.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="equipment">
          {e.reservations.length === 0 ? (
            <EmptyState title="Aucune réservation de matériel" description={`Période par défaut : ${formatDateTime(windowStart, tz)} → ${formatDateTime(windowEnd, tz)}`} action={can(ctx, "reservations:write") && write ? <Button asChild size="sm"><Link href={`/reservations/new?eventId=${e.id}`}>Réserver du matériel</Link></Button> : undefined} />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Réservation</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead className="text-right">Références</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {e.reservations.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/reservations/${r.id}`} className="font-medium hover:underline">
                          {r.reference}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {formatDateTime(r.startAt, tz)} → {formatDateTime(r.endAt, tz)}
                      </TableCell>
                      <TableCell className="text-right">{r.lineCount}</TableCell>
                      <TableCell>
                        <StatusBadge value={r.status} labels={reservationStatusLabels} tones={reservationStatusTones} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="team">
          <div className="mb-3 flex justify-end">{can(ctx, "staff:assign") && write ? <AssignStaffDialog eventId={e.id} staff={staff} skills={skills.map((s) => ({ value: s.id, label: s.name }))} defaultStart={windowStart} defaultEnd={windowEnd} /> : null}</div>
          {e.staffAssignments.length === 0 ? (
            <EmptyState icon={Users} title="Personne n'est affecté" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Collaborateur</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Horaires</TableHead>
                    {can(ctx, "staff:costs") ? <TableHead className="text-right">Coût horaire</TableHead> : null}
                    <TableHead>Statut</TableHead>
                    {can(ctx, "staff:assign") ? <TableHead className="sr-only">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {e.staffAssignments.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link href={`/team/${s.staff.id}`} className="font-medium hover:underline">
                          {s.staff.firstName} {s.staff.lastName}
                        </Link>
                      </TableCell>
                      <TableCell>{s.role}</TableCell>
                      <TableCell>
                        {formatDateTime(s.startAt, tz)} → {formatDateTime(s.endAt, tz)}
                      </TableCell>
                      {can(ctx, "staff:costs") ? <TableCell className="text-right tabular-nums">{formatMoney(s.hourlyCost)}</TableCell> : null}
                      <TableCell>
                        <Badge tone={s.status === "PROPOSED" ? "warning" : s.status === "DECLINED" ? "danger" : s.status === "CONFIRMED" ? "success" : undefined}>{assignmentStatusLabels[s.status]}</Badge>
                        {s.status === "DECLINED" && s.declineReason ? <p className="mt-1 max-w-56 text-xs text-muted-foreground">{s.declineReason}</p> : null}
                      </TableCell>
                      {can(ctx, "staff:assign") ? (
                        <TableCell className="text-right">
                          {s.status !== "COMPLETED" && s.status !== "DECLINED" ? (
                            <ActionButton url={`/api/staff-assignments/${s.id}`} method="PATCH" body={{ status: "CANCELLED" }} size="sm" variant="ghost" successMessage="Affectation annulée" confirm={{ title: "Annuler cette affectation ?", description: `${s.staff.firstName} ${s.staff.lastName} — ${s.role}`, destructive: true }}>
                              Retirer
                            </ActionButton>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="vehicles">
          <div className="mb-3 flex justify-end">{can(ctx, "vehicles:assign") && write ? <AssignVehicleDialog eventId={e.id} vehicles={vehicles} drivers={staff} defaultStart={windowStart} defaultEnd={windowEnd} /> : null}</div>
          {e.vehicleAssignments.length === 0 ? (
            <EmptyState title="Aucun véhicule affecté" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Véhicule</TableHead>
                    <TableHead>Chauffeur</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead className="text-right">Charge</TableHead>
                    <TableHead>Statut</TableHead>
                    {can(ctx, "vehicles:assign") ? <TableHead className="sr-only">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {e.vehicleAssignments.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <Link href={`/vehicles/${v.vehicle.id}`} className="font-medium hover:underline">
                          {v.vehicle.registration}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {v.vehicle.brand} {v.vehicle.model} {v.purpose ? `· ${v.purpose}` : ""}
                        </span>
                      </TableCell>
                      <TableCell>{v.driver ? `${v.driver.firstName} ${v.driver.lastName}` : "—"}</TableCell>
                      <TableCell>
                        {formatDateTime(v.startAt, tz)} → {formatDateTime(v.endAt, tz)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{v.loadWeightKg ? `${v.loadWeightKg} kg` : "—"}</TableCell>
                      <TableCell>
                        <Badge>{assignmentStatusLabels[v.status]}</Badge>
                      </TableCell>
                      {can(ctx, "vehicles:assign") ? (
                        <TableCell className="text-right">
                          {v.status !== "COMPLETED" ? (
                            <ActionButton url={`/api/vehicle-assignments/${v.id}`} method="PATCH" body={{ status: "CANCELLED" }} size="sm" variant="ghost" successMessage="Affectation annulée" confirm={{ title: "Libérer ce véhicule ?", description: v.vehicle.registration, destructive: true }}>
                              Libérer
                            </ActionButton>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tasks">
          <div className="mb-3 flex justify-end">{can(ctx, "tasks:write") ? <AddTaskDialog eventId={e.id} staff={staff} /> : null}</div>
          {e.tasks.length === 0 ? (
            <EmptyState title="Aucune tâche" />
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {e.tasks.map((t) => {
                  const overdue = t.dueAt && new Date(t.dueAt) < new Date() && (t.status === "TODO" || t.status === "IN_PROGRESS");
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className={t.status === "DONE" ? "text-muted-foreground line-through" : "font-medium"}>{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName} · ` : ""}
                          {t.dueAt ? <span className={overdue ? "text-destructive" : undefined}>échéance {formatDateTime(t.dueAt, tz)}</span> : "sans échéance"} · {taskPriorityLabels[t.priority]}
                        </p>
                      </div>
                      <TaskStatusSelect taskId={t.id} status={t.status} disabled={!can(ctx, "tasks:write")} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="notes">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-3">
              {e.notes.length === 0 ? <EmptyState title="Aucune note" /> : null}
              {e.notes.map((n) => (
                <Card key={n.id}>
                  <CardContent className="pt-4">
                    <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {n.author ?? "—"} · {formatDateTime(n.createdAt, tz)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {write ? (
              <Card>
                <CardContent className="pt-5">
                  <AddNoteForm eventId={e.id} />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsPanel target="event" targetId={e.id} documents={e.documents} canWrite={write && can(ctx, "documents:write")} />
        </TabsContent>

        {fin ? (
          <TabsContent value="finance">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Rentabilité (HT)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Poste</TableHead>
                        <TableHead className="text-right">Prévisionnel</TableHead>
                        <TableHead className="text-right">Réel</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Chiffre d&apos;affaires</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(fin.revenueForecast)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(fin.revenueInvoiced)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Main-d&apos;œuvre</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(fin.laborPlanned)}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(fin.laborActual) > 0 ? formatMoney(fin.laborActual) : "—"}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Transport</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(fin.transportCost)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(fin.transportCost)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Dépenses</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(fin.expenses)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(fin.expenses)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Pertes de matériel</TableCell>
                        <TableCell className="text-right">—</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(fin.equipmentLosses)}</TableCell>
                      </TableRow>
                      <TableRow className="font-medium">
                        <TableCell>Coût total</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(fin.costForecast)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(fin.costActual)}</TableCell>
                      </TableRow>
                      <TableRow className="font-semibold">
                        <TableCell>Marge</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(fin.marginForecast)} <span className="text-xs text-muted-foreground">({fin.marginRateForecast ?? "—"} %)</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(fin.marginActual)} <span className="text-xs text-muted-foreground">({fin.marginRateActual ?? "—"} %)</span>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Encaissé : {formatMoney(fin.paymentsReceived)} TTC · Budget client : {formatMoney(e.budgetAmount)} · Devis en négociation : {formatMoney(fin.revenuePipeline)}. Indicateurs de gestion, distincts de la comptabilité générale.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Dépenses rattachées</CardTitle>
                  {can(ctx, "expenses:write") ? <AddExpenseDialog eventId={e.id} /> : null}
                </CardHeader>
                <CardContent>
                  {e.expenses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune dépense saisie.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {e.expenses.map((x) => (
                        <li key={x.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <span>
                            {x.description}
                            <span className="block text-xs text-muted-foreground">
                              {expenseCategoryLabels[x.category]} · {formatDate(x.incurredAt, tz)}
                            </span>
                          </span>
                          <span className="tabular-nums">{formatMoney(x.amountExclTax)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}

        <TabsContent value="history">
          {e.history.length === 0 ? (
            <EmptyState title="Aucun historique" />
          ) : (
            <ol className="flex flex-col gap-3 border-l border-border pl-4">
              {e.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <p>
                    <span className="font-medium">{h.actor ?? "Système"}</span> — <span className="text-muted-foreground">{h.action}</span>
                  </p>
                  {h.changes ? (
                    <p className="text-xs text-muted-foreground">
                      {Object.entries(h.changes)
                        .slice(0, 6)
                        .map(([k, v]) => `${k} : ${String(v)}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt, ctx.organization.timezone)}</p>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
