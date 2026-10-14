import { Archive, ArchiveRestore, FilePlus2, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/feedback/action-button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddAddressDialog, AddContactDialog } from "@/features/customers/components/contact-address-dialogs";
import { DocumentsPanel } from "@/features/documents/components/documents-panel";
import { formatDate, formatDateTime } from "@/lib/dates";
import { customerKindLabels, eventStatusLabels, eventStatusTones, invoiceStatusLabels, invoiceStatusTones, quoteStatusLabels, quoteStatusTones } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getCustomer } from "@/server/services/customer-service";

export const metadata = { title: "Fiche client" };

const ADDRESS_KIND = { BILLING: "Facturation", EVENT: "Lieu d'événement", OTHER: "Autre" } as const;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("customers:read");
  const { id } = await params;
  const c = await loadOr404(() => getCustomer(ctx, id));
  const tz = ctx.organization.timezone;
  const write = can(ctx, "customers:write");
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {c.name} {c.archivedAt ? <Badge>Archivé</Badge> : null}
          </span>
        }
        description={`${customerKindLabels[c.kind]} · client depuis le ${formatDate(c.createdAt, tz)}`}
        breadcrumbs={[{ label: "Clients", href: "/customers" }, { label: c.name }]}
        actions={
          <>
            {can(ctx, "events:write") ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/events/new?customerId=${c.id}`}>
                  <Plus /> Événement
                </Link>
              </Button>
            ) : null}
            {can(ctx, "quotes:write") ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/quotes/new?customerId=${c.id}`}>
                  <FilePlus2 /> Devis
                </Link>
              </Button>
            ) : null}
            {write ? (
              <>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/customers/${c.id}/edit`}>
                    <Pencil /> Modifier
                  </Link>
                </Button>
                <ActionButton
                  url={`/api/customers/${c.id}/archive`}
                  body={{ archived: !c.archivedAt }}
                  size="sm"
                  variant="outline"
                  successMessage={c.archivedAt ? "Client restauré" : "Client archivé"}
                  confirm={c.archivedAt ? undefined : { title: "Archiver ce client ?", description: "Le client n'apparaîtra plus dans les listes actives. Son historique est conservé et il peut être restauré.", confirmLabel: "Archiver" }}
                >
                  {c.archivedAt ? <ArchiveRestore /> : <Archive />} {c.archivedAt ? "Restaurer" : "Archiver"}
                </ActionButton>
              </>
            ) : null}
          </>
        }
      />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Aperçu</TabsTrigger>
          <TabsTrigger value="events">Événements ({c.events.length})</TabsTrigger>
          {c.canSeeQuotes ? <TabsTrigger value="quotes">Devis ({c.quotes.length})</TabsTrigger> : null}
          {c.canSeeInvoices ? <TabsTrigger value="invoices">Factures ({c.invoices.length})</TabsTrigger> : null}
          {can(ctx, "documents:read") ? <TabsTrigger value="documents">Documents ({c.documents.length})</TabsTrigger> : null}
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Coordonnées</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-2 hover:underline">
                    <Mail className="size-4 text-muted-foreground" aria-hidden /> {c.email}
                  </a>
                ) : null}
                {c.phone ? (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-2 hover:underline">
                    <Phone className="size-4 text-muted-foreground" aria-hidden /> {c.phone}
                  </a>
                ) : null}
                {c.siret ? <p className="text-muted-foreground">SIRET {c.siret}</p> : null}
                {c.vatNumber ? <p className="text-muted-foreground">TVA {c.vatNumber}</p> : null}
                {!c.email && !c.phone ? <p className="text-muted-foreground">Aucune coordonnée</p> : null}
                {c.notes ? <p className="mt-2 rounded-lg bg-muted p-3 whitespace-pre-wrap text-muted-foreground">{c.notes}</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Contacts</CardTitle>
                {write ? <AddContactDialog customerId={c.id} /> : null}
              </CardHeader>
              <CardContent>
                {c.contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun contact</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {c.contacts.map((ct) => (
                      <li key={ct.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                        <div>
                          <p className="font-medium">
                            {ct.firstName} {ct.lastName} {ct.isPrimary ? <Badge tone="accent">Principal</Badge> : null}
                          </p>
                          <p className="text-xs text-muted-foreground">{[ct.jobTitle, ct.email, ct.phone].filter(Boolean).join(" · ")}</p>
                        </div>
                        {write ? (
                          <ActionButton url={`/api/customers/${c.id}/contacts/${ct.id}`} method="DELETE" variant="ghost" size="icon-sm" aria-label="Supprimer le contact" successMessage="Contact supprimé" confirm={{ title: "Supprimer ce contact ?", description: `${ct.firstName} ${ct.lastName}`, destructive: true }}>
                            <Trash2 />
                          </ActionButton>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Adresses</CardTitle>
                {write ? <AddAddressDialog customerId={c.id} /> : null}
              </CardHeader>
              <CardContent>
                {c.addresses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune adresse</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {c.addresses.map((a) => (
                      <li key={a.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {ADDRESS_KIND[a.kind]}
                            {a.label ? ` · ${a.label}` : ""} {a.isDefault ? "· par défaut" : ""}
                          </p>
                          <p>{a.line1}</p>
                          {a.line2 ? <p>{a.line2}</p> : null}
                          <p>
                            {a.postalCode} {a.city}
                          </p>
                        </div>
                        {write ? (
                          <ActionButton url={`/api/customers/${c.id}/addresses/${a.id}`} method="DELETE" variant="ghost" size="icon-sm" aria-label="Supprimer l'adresse" successMessage="Adresse supprimée" confirm={{ title: "Supprimer cette adresse ?", description: a.line1, destructive: true }}>
                            <Trash2 />
                          </ActionButton>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="events">
          {c.events.length === 0 ? (
            <EmptyState title="Aucun événement" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Événement</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                          {e.reference}
                        </Link>
                      </TableCell>
                      <TableCell>{e.name}</TableCell>
                      <TableCell>{formatDateTime(e.startAt, e.timezone)}</TableCell>
                      <TableCell>
                        <StatusBadge value={e.status} labels={eventStatusLabels} tones={eventStatusTones} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="quotes">
          {c.quotes.length === 0 ? (
            <EmptyState title="Aucun devis" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Objet</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Total TTC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.quotes.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>
                        <Link href={`/quotes/${q.id}`} className="font-medium hover:underline">
                          {q.number}
                        </Link>
                      </TableCell>
                      <TableCell>{q.title}</TableCell>
                      <TableCell>
                        <StatusBadge value={q.status} labels={quoteStatusLabels} tones={quoteStatusTones} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(q.totalInclTax)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="invoices">
          {c.invoices.length === 0 ? (
            <EmptyState title="Aucune facture" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Objet</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead className="text-right">Total TTC</TableHead>
                    <TableHead className="text-right">Réglé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.invoices.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Link href={`/invoices/${i.id}`} className="font-medium hover:underline">
                          {i.number ?? "Brouillon"}
                        </Link>
                      </TableCell>
                      <TableCell>{i.title}</TableCell>
                      <TableCell>
                        <StatusBadge value={i.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
                      </TableCell>
                      <TableCell>{formatDate(i.dueDate, tz)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(i.totalInclTax)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(i.amountPaid)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsPanel target="customer" targetId={c.id} documents={c.documents} canWrite={write && can(ctx, "documents:write")} />
        </TabsContent>
        <TabsContent value="history">
          {c.history.length === 0 ? (
            <EmptyState title="Aucun historique" />
          ) : (
            <ol className="flex flex-col gap-3 border-l border-border pl-4">
              {c.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <p>
                    <span className="font-medium">{h.actor ?? "Système"}</span> — <span className="text-muted-foreground">{h.action}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt, tz)}</p>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
