"use client";
import { Loader2, Maximize, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ZONES } from "@/features/scene/layout";
import type { SceneData } from "@/features/scene/types";
import { apiFetch } from "@/lib/api-client";
import { detectWebGL } from "../loaders/webgl";
import { STATUS_COLORS, STATUS_LABELS } from "../materials/palette";
import type { FocusTarget } from "../scenes/world-scene";
import { Plan2D } from "./plan-2d";
import { useLighting, useQuality } from "./quality";

const WorldScene = dynamic(() => import("../scenes/world-scene"), { ssr: false });

const ROTATION_MS = 30_000;
const REFRESH_MS = 60_000;
const STEPS: { focus: FocusTarget; label: string }[] = [{ focus: { kind: "overview" }, label: "Vue d'ensemble" }, ...ZONES.map((z) => ({ focus: { kind: "zone", zone: z.id } as FocusTarget, label: z.label }))];

const NONE = new Set<string>();
const noop = () => undefined;

/** Horloge isolée : son rafraîchissement chaque seconde ne re-rend pas la scène 3D. */
function Clock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right">
      <p className="text-5xl font-semibold tabular-nums">{new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(now)}</p>
      <p className="mt-1 text-lg text-slate-300 capitalize">{new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(now)}</p>
    </div>
  );
}

/**
 * Affichage permanent sur un écran de l'agence : la caméra passe d'une zone à l'autre toutes les 30 s,
 * les données sont rechargées chaque minute, aucun contrôle n'est visible (ils apparaissent au survol).
 */
export function WallView({ organizationName, timezone }: { organizationName: string; timezone: string }) {
  const [data, setData] = useState<SceneData | null>(null);
  const [error, setError] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const [idle, setIdle] = useState(false);
  const [quality] = useQuality();
  const [lighting] = useLighting();

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<SceneData>("/api/scene"));
      setError(false);
    } catch {
      setError(true); // on garde la dernière scène connue et on réessaie au prochain cycle
    }
  }, []);

  useEffect(() => {
    setWebgl(detectWebGL().supported);
    void load();
    const refresh = setInterval(() => void load(), REFRESH_MS);
    const rotate = setInterval(() => setStep((s) => (s + 1) % STEPS.length), ROTATION_MS);
    return () => {
      clearInterval(refresh);
      clearInterval(rotate);
    };
  }, [load]);

  // Curseur et commandes masqués après 3 s sans mouvement de souris
  useEffect(() => {
    let t = setTimeout(() => setIdle(true), 3000);
    const onMove = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3000);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  const counts = useMemo(() => {
    const c = { ok: 0, info: 0, warning: 0, danger: 0, idle: 0 };
    for (const i of data?.items ?? []) c[i.status]++;
    return c;
  }, [data]);
  const current = STEPS[step]!;
  const onZoneClick = useCallback((zone: string) => setStep(Math.max(0, STEPS.findIndex((s) => s.focus.kind === "zone" && s.focus.zone === zone))), []);

  return (
    <div className={`fixed inset-0 bg-[#070a12] text-white ${idle ? "cursor-none" : ""}`}>
      {!data || webgl === null ? (
        <div className="flex h-full items-center justify-center gap-2 text-lg text-slate-400">
          <Loader2 className="size-5 animate-spin" /> Chargement…
        </div>
      ) : webgl ? (
        <WorldScene
          data={data}
          selectedKey={null}
          highlighted={NONE}
          focus={current.focus}
          editMode={false}
          onSelect={noop}
          onMove={noop}
          onContextLost={() => setWebgl(false)}
          onZoneClick={onZoneClick}
          quality={quality}
          lighting={lighting}
        />
      ) : (
        <div className="h-full p-8 pt-28">
          <Plan2D data={data} selectedKey={null} highlighted={NONE} onSelect={noop} />
        </div>
      )}

      {/* Bandeau supérieur */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/70 to-transparent p-8">
        <div>
          <p className="text-sm tracking-widest text-sky-300/80 uppercase">{organizationName}</p>
          <h1 className="mt-1 text-4xl font-semibold">{current.label}</h1>
        </div>
        <Clock timezone={timezone} />
      </div>

      {/* Bandeau inférieur : état global */}
      {data ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 bg-gradient-to-t from-black/75 to-transparent p-8">
          <div className="flex flex-wrap gap-6 text-lg">
            {(["danger", "warning", "info", "ok"] as const).map((s) => (
              <span key={s} className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: STATUS_COLORS[s] }} aria-hidden />
                <span className="font-semibold tabular-nums">{counts[s]}</span>
                <span className="text-slate-300">{STATUS_LABELS[s]}</span>
              </span>
            ))}
          </div>
          <div className="text-right text-sm text-slate-400">
            {data.counts.locations} emplacements · {data.counts.vehicles} véhicules · {data.counts.events} événements
            <br />
            {error ? <span className="text-amber-400">Connexion perdue — nouvel essai dans 1 min</span> : `Mis à jour à ${new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, timeStyle: "short" }).format(new Date(data.generatedAt))}`}
          </div>
        </div>
      ) : null}

      {/* Progression de la rotation */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10" aria-hidden>
        <div key={step} className="h-full bg-sky-400" style={{ animation: `wall-progress ${ROTATION_MS}ms linear forwards` }} />
      </div>
      <style>{`@keyframes wall-progress { from { width: 0 } to { width: 100% } }`}</style>

      {/* Commandes (visibles au survol seulement) */}
      <div className={`absolute top-1/2 right-6 flex -translate-y-1/2 flex-col gap-2 transition-opacity ${idle ? "opacity-0" : "opacity-100"}`}>
        <button
          type="button"
          onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => undefined))}
          className="flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
          aria-label="Plein écran"
        >
          <Maximize className="size-5" />
        </button>
        <Link href="/world" className="flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20" aria-label="Quitter le mur d'écrans">
          <X className="size-5" />
        </Link>
      </div>
    </div>
  );
}
