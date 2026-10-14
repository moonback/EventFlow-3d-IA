import { Building2, Download, Plus, User } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { customerKindLabels } from "@/lib/labels";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listCustomers } from "@/server/services/customer-service";

export const metadata = { title: "Clients" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("customers:read");
  const sp = await searchParams;
  const query = parseListParams(sp, { sort: "name" });
  const kind = firstParam(sp.kind);
  const archived = firstParam(sp.archived) === "true";
  const data = await listCustomers(ctx, { ...query, kind: kind === "COMPANY" || kind === "INDIVIDUAL" ? kind : undefined, archived });
  return (
    <>
      <PageHeader
        title="Clients"
        description="Particuliers, entreprises et institutions"
        actions={
          <>
            {can(ctx, "reports:export") ? (
              <Button variant="outline" size="sm" asChild>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- téléchargement de fichier, pas une navigation */}
                <a href="/api/exports/customers">
                  <Download /> Export CSV
                </a>
              </Button>
            ) : null}
            {can(ctx, "customers:write") ? (
              <Button size="sm" asChild>
                <Link href="/customers/new">
                  <Plus /> Nouveau client
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <ListToolbar
        placeholder="Nom, e-mail, contact…"
        filters={[
          { name: "kind", label: "Tous les types", options: [{ value: "COMPANY", label: "Entreprises" }, { value: "INDIVIDUAL", label: "Particuliers" }] },
          { name: "archived", label: "Clients actifs", options: [{ value: "true", label: "Clients archivés" }] },
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState icon={Building2} title="Aucun client" description="Ajoutez votre premier client ou modifiez vos filtres." action={can(ctx, "customers:write") ? <Button asChild size="sm"><Link href="/customers/new">Nouveau client</Link></Button> : undefined} />
      ) : (
        <>
          <DataTable
            caption="Liste des clients"
            sort={query.sort}
            dir={query.dir}
            columns={[
              { id: "name", header: "Client", sortable: true },
              { id: "kind", header: "Type", hideOnMobile: true },
              { id: "email", header: "E-mail", hideOnMobile: true },
              { id: "phone", header: "Téléphone", hideOnMobile: true },
              { id: "city", header: "Ville", hideOnMobile: true },
              { id: "events", header: "Événements", align: "right" },
              { id: "createdAt", header: "Créé le", sortable: true, hideOnMobile: true },
            ]}
            rows={data.items.map((c) => ({
              id: c.id,
              href: `/customers/${c.id}`,
              cells: {
                name: (
                  <span className="inline-flex items-center gap-2">
                    {c.kind === "COMPANY" ? <Building2 className="size-4 text-muted-foreground" aria-hidden /> : <User className="size-4 text-muted-foreground" aria-hidden />}
                    {c.name}
                    {c.archived ? <Badge>Archivé</Badge> : null}
                  </span>
                ),
                kind: customerKindLabels[c.kind],
                email: c.email ?? "—",
                phone: c.phone ?? "—",
                city: c.city ?? "—",
                events: c.eventCount,
                createdAt: new Date(c.createdAt).toLocaleDateString("fr-FR"),
              },
            }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
