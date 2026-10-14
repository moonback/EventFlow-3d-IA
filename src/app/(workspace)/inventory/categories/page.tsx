import { PageHeader } from "@/components/feedback/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryForm } from "./category-form";
import { pageContext } from "@/server/auth/page";
import { listCategories } from "@/server/services/inventory-service";
import Link from "next/link";

export const metadata = { title: "Catégories" };

export default async function CategoriesPage() {
  const ctx = await pageContext("inventory:write");
  const categories = await listCategories(ctx);
  return (
    <>
      <PageHeader title="Catégories de matériel" breadcrumbs={[{ label: "Catalogue", href: "/inventory" }, { label: "Catégories" }]} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Catégorie</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Références</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/inventory?categoryId=${c.id}`} className="inline-flex items-center gap-2 hover:underline">
                      <span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden /> {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell className="text-right">{c.productCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <CategoryForm />
      </div>
    </>
  );
}
