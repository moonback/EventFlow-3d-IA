"use client";
import { AlertTriangle, Box, CalendarDays, PersonStanding, ClipboardList, Loader2, Locate, Map as MapIcon, Maximize, Monitor, RefreshCw, Truck, Warehouse } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { SceneData } from "@/features/scene/types";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { vehicleOpsStatusLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { detectWebGL } from "../loaders/webgl";
import type { FocusTarget } from "../scenes/world-scene";
import { Plan2D } from "./plan-2d";
import { useLighting, useQuality } from "./quality";
import { ScenePanel } from "./scene-panel";

const WorldScene = dynamic(() => import("../scenes/world-scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Chargement du moteur 3D…
    </div>
  ),
});

class SceneErrorBoundary extends Component<{ onError: (message: string) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error.message);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Rose des vents décorative (coin inférieur gauche de la vue). */
function Compass() {
  return (
    <svg viewBox="0 0 100 100" className="size-28 text-sky-300/70" aria-hidden>
      <circle cx="50" cy="50" r="46" fill="rgb(8 14 30 / 0.55)" stroke="currentColor" strokeOpacity="0.35" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="2 3" />
      <rect x="36" y="36" width="28" height="28" fill="none" stroke="currentColor" strokeOpacity="0.4" />
      {[-7, 0, 7].map((o) => (
        <g key={o} stroke="currentColor" strokeOpacity="0.15">
          <line x1={50 + o} y1="36" x2={50 + o} y2="64" />
          <line x1="36" y1={50 + o} x2="64" y2={50 + o} />
        </g>
      ))}
      <circle cx="50" cy="50" r="1.8" fill="#38bdf8" />
      <path d="M50 8 L52 16 L48 16 Z" fill="currentColor" />
      {[
        ["N", 50, 7],
        ["S", 50, 97],
        ["E", 95, 52],
        ["O", 5, 52],
      ].map(([t, x, y]) => (
        <text key={t as string} x={x as number} y={y as number} fontSize="7" fill="currentColor" textAnchor="middle" fontFamily="inherit">
          {t}
        </text>
      ))}
    </svg>
  );
}

/**
 * Vue 3D intégrée au tableau de bord : état du site à gauche, fiche de l'objet sélectionné
 * à droite, barre de commandes en bas. Les données viennent de la même API que le monde 3D.
 */
export function SiteHero({ locations, preparing }: { locations: { value: string; label: string }[]; preparing: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<SceneData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"3d" | "plan">("3d");
  const [webgl, setWebgl] = useState<{ supported: boolean; reason?: string } | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusTarget>({ kind: "overview" });
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [quality] = useQuality();
  const [lighting] = useLighting();
  const [walk, setWalk] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<SceneData>("/api/scene"));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    setWebgl(detectWebGL());
    void load();
  }, [load]);

  // Données en direct : rechargement chaque minute quand l'onglet est visible
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const selected = useMemo(() => data?.items.find((i) => i.key === selectedKey) ?? null, [data, selectedKey]);
  const use3d = mode === "3d" && webgl?.supported && !sceneError;

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    const alerts = items.filter((i) => i.status === "danger");
    return {
      locations: items.filter((i) => i.kind === "STOCK_LOCATION").length,
      vehiclesAvailable: items.filter((i) => i.kind === "VEHICLE" && i.metrics?.some((m) => m.label === "Statut" && m.value === vehicleOpsStatusLabels.AVAILABLE)).length,
      eventsLive: items.filter((i) => i.kind === "EVENT" && i.variant === "live").length,
      alerts,
    };
  }, [data]);

  const select = (key: string | null) => {
    setSelectedKey(key);
    if (key) setFocus({ kind: "item", key });
  };

  const focusZone = (zone: string) => {
    setHighlighted(new Set());
    setFocus({ kind: "zone", zone });
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => toast.info("Le plein écran n'est pas disponible dans ce navigateur"));
  };

  const rows: { label: string; value: string; icon: typeof Box; onClick: () => void }[] = [
    { label: "Entrepôt", value: `${stats.locations} zones`, icon: Warehouse, onClick: () => focusZone("WAREHOUSE") },
    { label: "Véhicules", value: `${stats.vehiclesAvailable} disponibles`, icon: Truck, onClick: () => focusZone("LOGISTICS") },
    { label: "Événements", value: `${stats.eventsLive} en cours`, icon: CalendarDays, onClick: () => focusZone("EVENTS") },
    { label: "Préparation", value: `${preparing} en cours`, icon: ClipboardList, onClick: () => focusZone("WAREHOUSE") },
  ];

  return (
    <section ref={containerRef} aria-label="Vue 3D du site" className="relative h-[clamp(420px,62dvh,640px)] overflow-hidden rounded-2xl border border-border bg-background">
      {loadError ? (
        <div className="flex h-full items-center justify-center p-6 text-sm text-destructive">Impossible de charger la scène : {loadError}</div>
      ) : !data || !webgl ? (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement des données réelles…
        </div>
      ) : use3d ? (
        <SceneErrorBoundary onError={(m) => setSceneError(m)}>
          <WorldScene
            data={data}
            selectedKey={selectedKey}
            highlighted={highlighted}
            focus={focus}
            editMode={false}
            onSelect={select}
            onMove={() => undefined}
            onContextLost={() => setSceneError("Le contexte WebGL a été perdu")}
            onZoneClick={focusZone}
            walk={walk}
            onExitWalk={() => setWalk(false)}
            quality={quality}
            lighting={lighting}
          />
        </SceneErrorBoundary>
      ) : (
        <div className="h-full p-3 pt-16 sm:pl-64">
          <Plan2D data={data} selectedKey={selectedKey} highlighted={highlighted} onSelect={(k) => select(k)} />
        </div>
      )}

      {/* Bascule 3D / plan */}
      <div className="glass absolute top-3 left-3 flex gap-1 rounded-xl p-1" role="group" aria-label="Mode d'affichage">
        <button
          type="button"
          onClick={() => setMode("3d")}
          disabled={webgl !== null && !webgl.supported}
          aria-pressed={mode === "3d"}
          className={cn("flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50", mode === "3d" ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground")}
        >
          Vue 3D
        </button>
        <button
          type="button"
          onClick={() => setMode("plan")}
          aria-pressed={mode === "plan"}
          className={cn("flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors", mode === "plan" ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground")}
        >
          <MapIcon className="size-4" aria-hidden /> Plan
        </button>
      </div>

      {/* État du site */}
      {data ? (
        <div className="glass absolute top-16 left-3 hidden w-60 rounded-xl p-3 sm:block">
          <h2 className="text-sm font-semibold">État du site</h2>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("size-2.5 rounded-full", stats.alerts.length ? "bg-destructive" : "bg-success")} aria-hidden />
            {stats.alerts.length ? `${stats.alerts.length} point(s) d'attention` : "Tout fonctionne"}
          </p>
          <ul className="mt-3 flex flex-col border-t border-border/70 pt-1">
            {rows.map((r) => (
              <li key={r.label}>
                <button type="button" onClick={r.onClick} className="flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-left text-xs transition-colors hover:bg-white/5">
                  <r.icon className="size-4 text-muted-foreground" aria-hidden />
                  <span className="flex-1">{r.label}</span>
                  <span className="text-muted-foreground">{r.value}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => {
                  setHighlighted(new Set(stats.alerts.map((a) => a.key)));
                  if (stats.alerts[0]) setFocus({ kind: "item", key: stats.alerts[0].key });
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-left text-xs transition-colors hover:bg-white/5"
              >
                <AlertTriangle className="size-4 text-destructive" aria-hidden />
                <span className="flex-1">Alertes</span>
                {stats.alerts.length ? <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">{stats.alerts.length}</span> : <span className="text-muted-foreground">0</span>}
              </button>
            </li>
          </ul>
        </div>
      ) : null}

      {use3d ? (
        <div className="pointer-events-none absolute bottom-3 left-3 hidden md:block">
          <Compass />
        </div>
      ) : null}

      {/* Barre de commandes */}
      <div className="glass absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-1.5" role="toolbar" aria-label="Commandes de la vue">
        {use3d ? (
          <button type="button" onClick={() => setWalk(!walk)} aria-label="Visite à pied" aria-pressed={walk} title="Visite à pied (ZQSD / flèches, Échap pour quitter)" className={cn("flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground", walk && "bg-blue-600/30 text-blue-300")}>
            <PersonStanding className="size-4" />
          </button>
        ) : null}
        {[
          { label: "Vue d'ensemble", icon: Locate, onClick: () => {
              setWalk(false);
              setFocus({ kind: "overview" });
            }, active: focus.kind === "overview" && !walk },
          { label: "Entrepôt", icon: Box, onClick: () => focusZone("WAREHOUSE"), active: focus.kind === "zone" && focus.zone === "WAREHOUSE" },
          { label: "Recharger les données", icon: RefreshCw, onClick: () => void load(), active: false },
        ].map((b) => (
          <button key={b.label} type="button" onClick={b.onClick} aria-label={b.label} title={b.label} className={cn("flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground", b.active && "bg-blue-600/30 text-blue-300")}>
            <b.icon className="size-4" />
          </button>
        ))}
        <Link href="/world" aria-label="Ouvrir l'univers 3D" title="Ouvrir l'univers 3D" className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
          <Monitor className="size-4" />
        </Link>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button type="button" onClick={toggleFullscreen} aria-label="Plein écran" title="Plein écran" className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
          <Maximize className="size-4" />
        </button>
      </div>

      {/* Fiche de l'objet sélectionné */}
      {selected ? (
        <div className="absolute inset-x-3 bottom-3 z-10 h-[60%] overflow-hidden rounded-2xl border border-border shadow-2xl md:inset-x-auto md:top-3 md:right-3 md:h-auto md:w-[360px]">
          <ScenePanel
            item={selected}
            locations={locations}
            onClose={() => setSelectedKey(null)}
            onChanged={() => void load()}
            onFocusLocation={(id) => {
              const key = `STOCK_LOCATION:${id}`;
              if (data?.items.some((i) => i.key === key)) select(key);
              else toast.info("Cet emplacement n'est pas représenté dans la scène (emplacement système)");
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
