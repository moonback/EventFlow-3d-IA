"use client";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

export interface DataColumn {
  id: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  /** Masquer sur petits écrans */
  hideOnMobile?: boolean;
}

export interface DataRow {
  id: string;
  href?: string;
  cells: Record<string, ReactNode>;
  className?: string;
}

/**
 * Tableau métier basé sur TanStack Table. Tri et pagination sont pilotés par l'URL et
 * exécutés côté serveur ; les cellules arrivent pré-rendues depuis le composant serveur.
 */
export function DataTable({ columns, rows, sort, dir, caption }: { columns: DataColumn[]; rows: DataRow[]; sort?: string; dir?: "asc" | "desc"; caption?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const columnDefs = useMemo<ColumnDef<DataRow>[]>(
    () => columns.map((c) => ({ id: c.id, header: c.header, cell: ({ row }) => row.original.cells[c.id] ?? null, meta: c })),
    [columns],
  );
  const table = useReactTable({ data: rows, columns: columnDefs, getCoreRowModel: getCoreRowModel(), getRowId: (r) => r.id, manualSorting: true, manualPagination: true });

  const toggleSort = (id: string) => {
    const next = new URLSearchParams(params.toString());
    const nextDir = sort === id && dir === "asc" ? "desc" : "asc";
    next.set("sort", id);
    next.set("dir", nextDir);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => {
                const meta = h.column.columnDef.meta as DataColumn;
                const active = sort === meta.id;
                return (
                  <TableHead
                    key={h.id}
                    className={cn(meta.align === "right" && "text-right", meta.align === "center" && "text-center", meta.hideOnMobile && "hidden md:table-cell", meta.className)}
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {meta.sortable ? (
                      <button type="button" onClick={() => toggleSort(meta.id)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {active ? dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-50" />}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className={cn(row.original.href && "cursor-pointer", row.original.className)} onClick={row.original.href ? (e) => {
              if ((e.target as HTMLElement).closest("a,button,input,select,textarea")) return;
              router.push(row.original.href!);
            } : undefined}>
              {row.getVisibleCells().map((cell, i) => {
                const meta = cell.column.columnDef.meta as DataColumn;
                const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                return (
                  <TableCell key={cell.id} className={cn(meta.align === "right" && "text-right tabular-nums", meta.align === "center" && "text-center", meta.hideOnMobile && "hidden md:table-cell", meta.className)}>
                    {i === 0 && row.original.href ? (
                      <Link href={row.original.href} className="font-medium hover:underline">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
