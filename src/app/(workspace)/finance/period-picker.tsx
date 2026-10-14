"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Sélection de période (dates locales) synchronisée avec l'URL. */
export function PeriodPicker({ from, to, presets }: { from: string; to: string; presets: { label: string; from: string; to: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (f: string, t: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("from", f);
    next.set("to", t);
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      {presets.map((p) => (
        <Button key={p.label} size="sm" variant={p.from === from && p.to === to ? "default" : "outline"} onClick={() => go(p.from, p.to)}>
          {p.label}
        </Button>
      ))}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Du
        <Input type="date" value={from} onChange={(e) => e.target.value && go(e.target.value, to)} className="h-8 w-40" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Au (exclu)
        <Input type="date" value={to} onChange={(e) => e.target.value && go(from, e.target.value)} className="h-8 w-40" />
      </label>
    </div>
  );
}
