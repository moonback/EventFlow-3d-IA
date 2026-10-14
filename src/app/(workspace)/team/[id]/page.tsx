import { Mail, Pencil, Phone, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsPanel } from "@/features/documents/components/documents-panel";
import { PortalLinkCard } from "@/features/staff/components/portal-link-card";
import { TimesheetDialog, UnavailabilityDialog } from "@/features/staff/components/staff-dialogs";
import { formatDateTime } from "@/lib/dates";
import { assignmentStatusLabels, availabilityKindLabels, employmentTypeLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getStaffMember } from "@/server/services/staff-service";

export const metadata = { title: "Collaborateur" };

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("staff:read");
  const { id } = await params;
  const s = await loadOr404(() => getStaffMember(ctx, id));
  const tz = ctx.organization.timezone;
  const write = can(ctx, "staff:write");
  const name = `${s.firstName} ${s.lastName}`;
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {name} {!s.isActive ? <Badge tone="warning">Inactif</Badge> : null}
          </span>
        }
        description={`${s.jobTitle ?? "—"} · ${employmentTypeLabels[s.employmentType]}${s.user ? ` · compte ${s.user.email}` : ""}`}
        breadcrumbs={[{ label: "Équipe", href: "/team" }, { label: name }]}
        actions={
          write ? (
            <>
              <UnavailabilityDialog staffId={s.id} />
              <Button size="sm" asChild>
                <Link href={`/team/${s.id}/edit`}>
                  <Pencil /> Modifier
                </Link>
              </Button>
            </>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-2 pt-5 text-sm">
              {s.email ? (
                <a href={`mailto:${s.email}`} className="flex items-center gap-2 hover:underline">
                  <Mail className="size-4 text-muted-foreground" aria-hidden /> {s.email}
                </a>
              ) : null}
              {s.phone ? (
                <a href={`tel:${s.phone}`} className="flex items-center gap-2 hover:underline">
                  <Phone className="size-4 text-muted-foreground" aria-hidden /> {s.phone}
                </a>
              ) : null}
              <p>Permis : {s.drivingLicenses ?? "—"}</p>
              {s.hourlyCost !== null ? <p>Coût horaire : {formatMoney(s.hourlyCost)}</p> : null}
              <div className="mt-2 flex flex-wrap gap-1">
                {s.skills.map((k) => (
                  <Badge key={k.skill.id} tone="accent">
                    {k.skill.name}
                  </Badge>
                ))}
              </div>
              {s.notes ? <p className="mt-2 rounded-lg bg-muted p-2 text-muted-foreground">{s.notes}</p> : null}
            </CardContent>
          </Card>
          {can(ctx, "staff:assign") && s.isActive ? <PortalLinkCard staffId={s.id} hasEmail={Boolean(s.email)} activeLinks={s.portal.activeLinks} lastUsedAt={s.portal.lastUsedAt} tz={tz} /> : null}
        </div>
        <Tabs defaultValue="assignments">
          <TabsList>
            <TabsTrigger value="assignments">Affectations ({s.assignments.length})</TabsTrigger>
            <TabsTrigger value="availability">Disponibilités ({s.availabilities.length})</TabsTrigger>
            {can(ctx, "documents:read") ? <TabsTrigger value="documents">Documents ({s.documents.length})</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="assignments">
            {s.assignments.length === 0 ? (
              <EmptyState title="Aucune affectation" />
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Événement</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Horaires</TableHead>
                      <TableHead className="text-right">Prévu / réalisé (h)</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="sr-only">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.assignments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Link href={`/events/${a.event.id}`} className="font-medium hover:underline">
                            {a.event.reference}
                          </Link>
                          <span className="block text-xs text-muted-foreground">{a.event.name}</span>
                        </TableCell>
                        <TableCell>{a.role}</TableCell>
                        <TableCell className="text-xs">
                          {formatDateTime(a.startAt, a.event.timezone)} → {formatDateTime(a.endAt, a.event.timezone)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {a.plannedHours} / {a.workedHours}
                        </TableCell>
                        <TableCell>
                          <Badge tone={a.status === "PROPOSED" ? "warning" : a.status === "DECLINED" ? "danger" : a.status === "CONFIRMED" ? "success" : undefined}>{assignmentStatusLabels[a.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{can(ctx, "staff:assign") && !["CANCELLED", "PROPOSED", "DECLINED"].includes(a.status) ? <TimesheetDialog assignmentId={a.id} label={a.event.reference} /> : null}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="availability">
            {s.availabilities.length === 0 ? (
              <EmptyState title="Aucune période déclarée" />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Disponibilités et indisponibilités</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border text-sm">
                    {s.availabilities.map((u) => (
                      <li key={u.id} className="flex items-center justify-between py-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone={u.kind === "AVAILABLE" ? "success" : "neutral"}>{availabilityKindLabels[u.kind]}</Badge>
                          {formatDateTime(u.startAt, tz)} → {formatDateTime(u.endAt, tz)} {u.reason ? <span className="text-muted-foreground">· {u.reason}</span> : null}
                          {u.declaredViaPortal ? <span className="text-xs text-muted-foreground">(saisie par le prestataire)</span> : null}
                        </span>
                        {write ? (
                          <ActionButton url={`/api/staff-unavailability/${u.id}`} method="DELETE" size="icon-sm" variant="ghost" aria-label="Supprimer" successMessage="Supprimé" confirm={{ title: "Supprimer cette période ?", description: u.reason ?? "", destructive: true }}>
                            <Trash2 />
                          </ActionButton>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsPanel target="staff" targetId={s.id} documents={s.documents} canWrite={write && can(ctx, "documents:write")} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
