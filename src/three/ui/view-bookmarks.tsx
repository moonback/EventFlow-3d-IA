"use client";
import { Bookmark, Copy, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import type { SceneBookmark } from "@/features/scene/types";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { CameraReader } from "../scenes/world-scene";

type View = ReturnType<CameraReader>;

/** Encodage du point de vue dans l'adresse : `?view=x,y,z,tx,ty,tz` (mètres, 1 décimale). */
export function encodeView(v: View) {
  return [...v.position, ...v.target].map((n) => Math.round(n * 10) / 10).join(",");
}

export function decodeView(param: string | null): View | null {
  if (!param) return null;
  const n = param.split(",").map(Number);
  if (n.length !== 6 || !n.every((x) => Number.isFinite(x) && Math.abs(x) <= 500)) return null;
  return { position: [n[0]!, n[1]!, n[2]!], target: [n[3]!, n[4]!, n[5]!] };
}

function viewUrl(v: View) {
  const url = new URL("/world", window.location.origin);
  url.searchParams.set("view", encodeView(v));
  return url.toString();
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copié dans le presse-papiers`);
  } catch {
    // Presse-papiers indisponible (contexte non sécurisé, refus) : on affiche le lien à copier
    window.prompt("Copiez ce lien :", text);
  }
}

/**
 * Points de vue enregistrés : partagés avec toute l'organisation (« Quai 2 », « Rayonnage B »…).
 * Un clic y amène la caméra ; chaque point de vue (et la vue actuelle) a un lien partageable.
 */
export function ViewBookmarks({ read, onGo }: { read: () => View | null; onGo: (v: View) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SceneBookmark[] | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<SceneBookmark[]>("/api/scene/bookmarks"));
    } catch (e) {
      toast.error(errorMessage(e));
      setItems([]);
    }
  }, []);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const save = async () => {
    const v = read();
    if (!v || !name.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/api/scene/bookmarks", { method: "POST", body: { name: name.trim(), ...v } });
      toast.success(`Point de vue « ${name.trim()} » enregistré pour toute l'équipe`);
      setName("");
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: SceneBookmark) => {
    try {
      await apiFetch(`/api/scene/bookmarks/${b.id}`, { method: "DELETE" });
      setItems((list) => list?.filter((x) => x.id !== b.id) ?? null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="Points de vue enregistrés et liens partageables">
          <Bookmark /> Points de vue
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nom de la vue actuelle (ex. Quai 2)" aria-label="Nom du point de vue" className="h-8" />
          <Button type="submit" size="sm" loading={saving} disabled={!name.trim()} aria-label="Enregistrer la vue actuelle">
            <Plus />
          </Button>
        </form>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 w-full"
          onClick={() => {
            const v = read();
            if (v) void copy(viewUrl(v), "Lien de la vue actuelle");
          }}
        >
          <Link2 /> Copier le lien de la vue actuelle
        </Button>
        <div className="mt-3 border-t border-border pt-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Partagés avec l&apos;équipe</p>
          {items === null ? (
            <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Chargement…
            </p>
          ) : items.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Aucun point de vue enregistré.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {items.map((b) => (
                <li key={b.id} className="group flex items-center gap-1 rounded-md hover:bg-accent">
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-2 py-1.5 text-left text-sm"
                    onClick={() => {
                      onGo(b);
                      setOpen(false);
                    }}
                    title={b.createdByName ? `Enregistré par ${b.createdByName}` : undefined}
                  >
                    <span className="block truncate">{b.name}</span>
                  </button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Copier le lien de « ${b.name} »`} onClick={() => void copy(viewUrl(b), "Lien")}>
                    <Copy />
                  </Button>
                  {b.canDelete ? (
                    <Button size="icon-sm" variant="ghost" aria-label={`Supprimer « ${b.name} »`} onClick={() => void remove(b)}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
