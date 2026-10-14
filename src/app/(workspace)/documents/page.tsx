import { Download, Eye, FolderOpen } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { documentCategoryLabels } from "@/lib/labels";
import { firstParam } from "@/lib/pagination";
import { pageContext } from "@/server/auth/page";
import { listDocuments } from "@/server/services/document-service";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("documents:read");
  const sp = await searchParams;
  const docs = await listDocuments(ctx, { q: firstParam(sp.q), take: 200 });
  return (
    <>
      <PageHeader title="Documents" description="Pièces jointes privées de l'organisation (contrats, plans, fiches techniques…), téléchargeables uniquement par les personnes autorisées. Les devis, factures et bons sont générés à la demande depuis leurs fiches." />
      <ListToolbar placeholder="Nom du fichier…" />
      {docs.length === 0 ? (
        <EmptyState icon={FolderOpen} title="Aucun document" description="Téléversez des documents depuis les fiches client, événement, véhicule ou collaborateur." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Rattaché à</TableHead>
                <TableHead>Ajouté le</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.fileName}</TableCell>
                  <TableCell>{documentCategoryLabels[d.category]}</TableCell>
                  <TableCell className="text-sm">
                    {d.customer ? <Link href={`/customers/${d.customer.id}`} className="hover:underline">Client · {d.customer.name}</Link> : null}
                    {d.event ? <Link href={`/events/${d.event.id}`} className="hover:underline">Événement · {d.event.reference}</Link> : null}
                    {d.vehicle ? <Link href={`/vehicles/${d.vehicle.id}`} className="hover:underline">Véhicule · {d.vehicle.registration}</Link> : null}
                    {d.staff ? <Link href={`/team/${d.staff.id}`} className="hover:underline">Collaborateur · {d.staff.firstName} {d.staff.lastName}</Link> : null}
                  </TableCell>
                  <TableCell>{formatDate(d.createdAt, ctx.organization.timezone)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a href={`/api/documents/${d.id}/download?inline=1`} target="_blank" rel="noopener" aria-label={`Aperçu ${d.fileName}`}>
                        <Eye />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a href={`/api/documents/${d.id}/download`} aria-label={`Télécharger ${d.fileName}`}>
                        <Download />
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
