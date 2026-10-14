import { Globe2, MapPin } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/feedback/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { locationKindLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { listLocations } from "@/server/services/inventory-service";
import { LocationDialog } from "./location-form";

export const metadata = { title: "Entrepôt" };

const KIND_STYLE: Record<string, string> = {
  RACK: "border-sky-500/40 bg-sky-500/5",
  ZONE: "border-border bg-muted/40",
  WAREHOUSE: "border-border bg-muted/30",
  BIN: "border-sky-500/30 bg-sky-500/5",
  PREPARATION: "border-amber-500/50 bg-amber-500/10",
  RETURN: "border-violet-500/50 bg-violet-500/10",
  QUARANTINE: "border-red-500/50 bg-red-500/10",
  MAINTENANCE: "border-orange-500/50 bg-orange-500/10",
  OUT: "border-cyan-500/50 bg-cyan-500/10",
};

/** Plan 2D de l'entrepôt : alternative accessible et sans WebGL à la vue 3D. */
export default async function WarehousePage() {
  const ctx = await pageContext("stock:read");
  const locations = await listLocations(ctx);
  const byParent = (id: string | null) => locations.filter((l) => l.parentId === id);
  const maxUnits = Math.max(1, ...locations.filter((l) => l.kind === "RACK").map((l) => l.unitCount));
  const roots = byParent(null);
  const parents = locations.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }));
  const Tile = ({ l }: { l: (typeof locations)[number] }) => (
    <Link href={`/warehouse/locations/${l.id}`} className={cn("block rounded-lg border p-3 transition-colors hover:border-primary", KIND_STYLE[l.kind], !l.isActive && "opacity-50")}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{l.code}</span>
        <span className="text-[11px] text-muted-foreground">{locationKindLabels[l.kind]}</span>
      </div>
      <p className="truncate text-xs text-muted-foreground">{l.name}</p>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.round((Math.min(l.unitCount, maxUnits) / maxUnits) * 100)}%` }} />
        </div>
        <span className="text-xs tabular-nums">
          {l.productCount} réf. · {l.unitCount} u.
        </span>
      </div>
    </Link>
  );
  return (
    <>
      <PageHeader
        title="Entrepôt"
        description="Plan de l'entrepôt par zones et rayonnages (vue 2D, identique au monde 3D)."
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link href="/world?zone=WAREHOUSE">
                <Globe2 /> Voir en 3D
              </Link>
            </Button>
            {can(ctx, "inventory:write") ? <LocationDialog parents={parents} /> : null}
          </>
        }
      />
      <div className="flex flex-col gap-4">
        {roots.map((root) => {
          const children = byParent(root.id);
          return (
            <Card key={root.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" aria-hidden />
                  <Link href={`/warehouse/locations/${root.id}`} className="hover:underline">
                    {root.code} — {root.name}
                  </Link>
                  <Badge>{locationKindLabels[root.kind]}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {children.length === 0 ? <Tile l={root} /> : null}
                {children
                  .filter((c) => c.kind === "ZONE")
                  .map((zone) => (
                    <section key={zone.id} aria-label={zone.name} className="rounded-xl border border-dashed border-border p-3">
                      <p className="mb-2 text-sm font-medium">
                        <Link href={`/warehouse/locations/${zone.id}`} className="hover:underline">
                          {zone.code} — {zone.name}
                        </Link>
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                        {byParent(zone.id).map((r) => (
                          <Tile key={r.id} l={r} />
                        ))}
                      </div>
                    </section>
                  ))}
                {children.filter((c) => c.kind !== "ZONE").length ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {children
                      .filter((c) => c.kind !== "ZONE")
                      .map((c) => (
                        <Tile key={c.id} l={c} />
                      ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
