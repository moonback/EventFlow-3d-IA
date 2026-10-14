import { Globe2, Pencil } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { Alert } from "@/components/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsPanel } from "@/features/documents/components/documents-panel";
import { AddExpenseDialog } from "@/features/events/components/event-dialogs";
import { VehicleMaintenanceDialog } from "@/features/vehicles/components/vehicle-maintenance-dialog";
import { formatDate, formatDateTime } from "@/lib/dates";
import { assignmentStatusLabels, expenseCategoryLabels, vehicleOpsStatusLabels, vehicleOpsStatusTones, vehicleStatusLabels, vehicleTypeLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getVehicle } from "@/server/services/vehicle-service";

export const metadata = { title: "Véhicule" };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("vehicles:read");
  const { id } = await params;
  const v = await loadOr404(() => getVehicle(ctx, id));
  const tz = ctx.organization.timezone;
  const write = can(ctx, "vehicles:write");
  const now = new Date();
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{v.registration}</span> <StatusBadge value={v.ops} labels={vehicleOpsStatusLabels} tones={vehicleOpsStatusTones} />
          </span>
        }
        description={`${v.brand} ${v.model} · ${vehicleTypeLabels[v.type]} · statut administratif : ${vehicleStatusLabels[v.status]}`}
        breadcrumbs={[{ label: "Véhicules", href: "/vehicles" }, { label: v.registration }]}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/world?focus=VEHICLE:${v.id}`}>
                <Globe2 /> Voir en 3D
              </Link>
            </Button>
            {write ? (
              <>
                <VehicleMaintenanceDialog vehicleId={v.id} />
                <Button size="sm" asChild>
                  <Link href={`/vehicles/${v.id}/edit`}>
                    <Pencil /> Modifier
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />
      {v.alerts.length ? (
        <div className="mb-4 flex flex-col gap-2">
          {v.alerts.map((a, i) => (
            <Alert key={i} tone={a.level === "danger" ? "danger" : "warning"}>
              {a.message}
            </Alert>
          ))}
        </div>
      ) : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Charge utile", v.payloadKg ? `${v.payloadKg} kg` : "—"],
          ["Volume", v.volumeM3 ? `${v.volumeM3} m³` : "—"],
          ["Kilométrage", `${v.mileageKm.toLocaleString("fr-FR")} km`],
          ["Permis", v.requiredLicense ?? "—"],
        ].map(([k, val]) => (
          <Card key={k}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="text-lg font-semibold">{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Tabs defaultValue="missions">
        <TabsList>
          <TabsTrigger value="missions">Missions ({v.assignments.length})</TabsTrigger>
          <TabsTrigger value="maintenance">Entretien ({v.maintenances.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({v.documents.length})</TabsTrigger>
          {v.dailyCost !== null || can(ctx, "finance:read") ? <TabsTrigger value="costs">Coûts</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="missions">
          {v.assignments.length === 0 ? (
            <EmptyState title="Aucune mission" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Événement</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead>Chauffeur</TableHead>
                    <TableHead className="text-right">Charge</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.assignments.map((a) => (
                    <TableRow key={a.id} className={new Date(a.endAt) < now ? "opacity-60" : undefined}>
                      <TableCell>
                        <Link href={`/events/${a.event.id}`} className="font-medium hover:underline">
                          {a.event.reference}
                        </Link>{" "}
                        <span className="text-muted-foreground">{a.event.name}</span>
                      </TableCell>
                      <TableCell>
                        {formatDateTime(a.startAt, a.event.timezone)} → {formatDateTime(a.endAt, a.event.timezone)}
                      </TableCell>
                      <TableCell>{a.driver ? `${a.driver.firstName} ${a.driver.lastName}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.loadWeightKg ? `${a.loadWeightKg} kg` : "—"}</TableCell>
                      <TableCell>
                        <Badge>{assignmentStatusLabels[a.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="maintenance">
          {v.maintenances.length === 0 ? (
            <EmptyState title="Aucun entretien" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Intervention</TableHead>
                    <TableHead>Prévu</TableHead>
                    <TableHead>Réalisé</TableHead>
                    <TableHead className="text-right">Coût</TableHead>
                    <TableHead className="sr-only">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.maintenances.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        {m.title} {m.blocksVehicle ? <Badge tone="warning">Immobilise</Badge> : null}
                      </TableCell>
                      <TableCell>{formatDate(m.scheduledAt, tz)}</TableCell>
                      <TableCell>{m.completedAt ? formatDate(m.completedAt, tz) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(m.cost)}</TableCell>
                      <TableCell className="text-right">
                        {!m.completedAt && write ? (
                          <ActionButton url={`/api/vehicle-maintenance/${m.id}/complete`} body={{ cost: null, mileageKm: null }} size="sm" variant="outline" successMessage="Entretien terminé">
                            Terminé
                          </ActionButton>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsPanel target="vehicle" targetId={v.id} documents={v.documents} canWrite={write && can(ctx, "documents:write")} />
        </TabsContent>
        <TabsContent value="costs">
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Barème</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <p>Coût / jour : {formatMoney(v.dailyCost)}</p>
                <p>Coût / km : {v.costPerKm ? `${v.costPerKm} €` : "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Dépenses</CardTitle>
                {can(ctx, "expenses:write") ? <AddExpenseDialog vehicleId={v.id} /> : null}
              </CardHeader>
              <CardContent>
                {v.expenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune dépense.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {v.expenses.map((x) => (
                      <li key={x.id} className="flex justify-between py-2">
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
      </Tabs>
    </>
  );
}
