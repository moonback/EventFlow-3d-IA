"use client";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { NAV_SECTIONS } from "./nav";

interface Hit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const TYPE_LABELS: Record<string, string> = {
  customer: "Client",
  event: "Événement",
  product: "Produit",
  quote: "Devis",
  invoice: "Facture",
  vehicle: "Véhicule",
  staff: "Collaborateur",
  reservation: "Réservation",
};

/** Recherche globale (Ctrl/⌘ + K) + raccourcis de navigation « g puis lettre ». */
export function CommandSearch({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const pendingG = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (pendingG.current) {
        pendingG.current = false;
        const item = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.shortcut === e.key && permissions.includes(i.permission));
        if (item) router.push(item.href);
        return;
      }
      if (e.key === "g") {
        pendingG.current = true;
        setTimeout(() => (pendingG.current = false), 1200);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [permissions, router]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setHits(await apiFetch<Hit[]>(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal }));
        setIndex(0);
      } catch {
        /* recherche interrompue */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const pages = NAV_SECTIONS.flatMap((s) => s.items)
    .filter((i) => permissions.includes(i.permission) && q && i.label.toLowerCase().includes(q.toLowerCase()))
    .map((i) => ({ type: "page", id: i.href, title: i.label, subtitle: "Module", href: i.href }));
  const results: Hit[] = [...pages, ...hits];

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    setOpen(false);
    setQ("");
    router.push(hit.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full max-w-lg items-center gap-3 rounded-full border border-border bg-card/70 px-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card"
      >
        <Search className="size-4" aria-hidden />
        <span className="truncate">Rechercher un événement, un client, un matériel…</span>
        <kbd className="ml-auto hidden rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] sm:inline">⌘ K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] translate-y-0 gap-0 p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Recherche globale</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setIndex((i) => Math.min(results.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setIndex((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  go(results[index]);
                }
              }}
              placeholder="Tapez au moins 2 caractères…"
              className="h-12 flex-1 bg-transparent text-sm outline-none"
              aria-label="Recherche globale"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="global-search-results"
            />
          </div>
          <ul id="global-search-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
            {loading && results.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">Recherche…</li> : null}
            {!loading && q.length >= 2 && results.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun résultat</li> : null}
            {q.length < 2 ? (
              <li className="px-3 py-4 text-xs text-muted-foreground">
                Astuces : <kbd>/</kbd> ou <kbd>Ctrl K</kbd> pour rechercher · <kbd>g</kbd> puis <kbd>d</kbd> tableau de bord, <kbd>w</kbd> monde 3D, <kbd>e</kbd> événements, <kbd>i</kbd> stock, <kbd>c</kbd> clients
              </li>
            ) : null}
            {results.map((h, i) => (
              <li key={`${h.type}-${h.id}`} role="option" aria-selected={i === index}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(h)}
                  className={cn("flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm", i === index && "bg-accent")}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{h.title}</span>
                    {h.subtitle ? <span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{TYPE_LABELS[h.type] ?? "Page"}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
