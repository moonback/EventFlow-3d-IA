import { Plus, UserSquare2 } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/feedback/page-header";
import { DataTable } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { firstParam, parseListParams } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listSuppliers } from "@/server/services/supplier-service";

export const metadata = { title: "Fournisseurs" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("suppliers:read");
  const sp = await searchParams;
  const query = parseListParams(sp);
  const data = await listSuppliers(ctx, { ...query, archived: firstParam(sp.archived) === "true" });
  return (
    <>
      <PageHeader
        title="Fournisseurs"
        actions={
          can(ctx, "suppliers:write") ? (
            <Button size="sm" asChild>
              <Link href="/suppliers/new">
                <Plus /> Fournisseur
              </Link>
            </Button>
          ) : null
        }
      />
      <ListToolbar placeholder="Nom, e-mail, ville…" filters={[{ name: "archived", label: "Actifs", options: [{ value: "true", label: "Archivés" }] }]} />
      {data.items.length === 0 ? (
        <EmptyState icon={UserSquare2} title="Aucun fournisseur" />
      ) : (
        <>
          <DataTable
            caption="Fournisseurs"
            columns={[
              { id: "name", header: "Fournisseur" },
              { id: "email", header: "E-mail", hideOnMobile: true },
              { id: "phone", header: "Téléphone", hideOnMobile: true },
              { id: "city", header: "Ville", hideOnMobile: true },
              { id: "products", header: "Produits", align: "right" },
              { id: "orders", header: "Commandes", align: "right" },
            ]}
            rows={data.items.map((s) => ({ id: s.id, href: `/suppliers/${s.id}`, cells: { name: s.name, email: s.email ?? "—", phone: s.phone ?? "—", city: s.city ?? "—", products: s.productCount, orders: s.orderCount } }))}
          />
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </>
      )}
    </>
  );
}
