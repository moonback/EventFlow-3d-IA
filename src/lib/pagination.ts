import { z } from "zod";

export const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().max(50).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function paginationArgs(query: Pick<ListQuery, "page" | "pageSize">) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function paginated<T>(items: T[], total: number, query: Pick<ListQuery, "page" | "pageSize">): Paginated<T> {
  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}

/** Lit les paramètres de recherche d'une page (searchParams Next) de façon tolérante. */
export function parseListParams(
  searchParams: Record<string, string | string[] | undefined>,
  defaults: Partial<ListQuery> = {},
): ListQuery {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "") flat[k] = value;
  }
  const parsed = listQuerySchema.safeParse({ ...defaults, ...flat });
  return parsed.success ? parsed.data : listQuerySchema.parse(defaults);
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "" ? undefined : v;
}
