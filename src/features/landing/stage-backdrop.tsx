"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { detectWebGL } from "@/three/loaders/webgl";
import { setActiveCue, useActiveCue } from "./cue-store";
import { CUES, GEL } from "./cues";

const StageScene = dynamic(() => import("./stage-scene"), { ssr: false, loading: () => null });

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Faisceaux en CSS : affichés pendant le chargement et quand WebGL est indisponible. */
function FallbackBeams() {
  const beams = [
    { left: "4%", beam: GEL.amber, d: "0s" },
    { left: "22%", beam: GEL.magenta, d: "-2s" },
    { left: "40%", beam: GEL.lavender, d: "-4s" },
    { left: "58%", beam: GEL.lavender, d: "-1s" },
    { left: "76%", beam: GEL.magenta, d: "-3s" },
  ];
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_100%,#2a1f4d_0%,#0e0b1a_60%)]">
      {beams.map((b) => (
        <span key={b.left} className="lp-fallback-beam" style={{ left: b.left, "--beam": b.beam, "--d": b.d } as CSSProperties} />
      ))}
    </div>
  );
}

/**
 * Plateau 3D collant derrière l'ouverture et la conduite. Le rendu s'arrête dès que la section
 * sort de l'écran ; mouvement réduit = image fixe, recalculée seulement au changement de cue.
 */
export function StageBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [quality, setQuality] = useState<"low" | "high">("high");

  useEffect(() => {
    setWebgl(detectWebGL().supported);
    const cores = navigator.hardwareConcurrency ?? 8;
    setQuality(window.innerWidth < 768 || cores <= 4 ? "low" : "high");
    const section = ref.current?.parentElement;
    if (!section) return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { rootMargin: "100px" });
    io.observe(section);
    const t = setTimeout(() => setReady(true), 120);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, []);

  return (
    <div ref={ref} className="pointer-events-none sticky top-0 -mb-[100dvh] h-dvh w-full" aria-hidden>
      <FallbackBeams />
      {webgl ? (
        <div className="absolute inset-0 transition-opacity duration-[1600ms]" style={{ opacity: ready ? 1 : 0 }}>
          <StageScene active={visible} reduced={reduced} quality={quality} />
        </div>
      ) : null}
      {/* Lisibilité : assombrit le bas et la gauche (ouverture) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_top,#0e0b1a_0%,rgb(14_11_26/0.3)_18%,transparent_40%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(14_11_26/0.75)_0%,rgb(14_11_26/0.25)_45%,transparent_70%)]" />
    </div>
  );
}

/**
 * Observe les éléments [data-cue] : celui qui traverse le milieu de l'écran devient le cue actif
 * (-1 = ouverture). Les cards reçoivent data-active pour leur mise en lumière.
 */
export function CueObserver() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-cue]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const index = Number((e.target as HTMLElement).dataset.cue);
          setActiveCue(index);
          for (const el of els) el.dataset.active = String(Number(el.dataset.cue) === index);
        }
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

/** Fait apparaître les éléments .lp-reveal quand ils entrent à l'écran. */
export function RevealObserver() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    document.querySelectorAll(".lp-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Bandeau de régie : cue en cours et timecode (25 images/s). */
export function CueHud() {
  const cue = useActiveCue();
  const tc = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const ms = performance.now() - start;
      const s = Math.floor(ms / 1000);
      if (tc.current) tc.current.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(Math.floor((ms % 1000) / 40))}`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  const current = cue >= 0 ? CUES[cue] : null;
  const color = current ? current.light.colors[0] : GEL.amber;
  return (
    <div className="lp-mono flex items-center gap-3 text-[0.7rem] uppercase tracking-[0.14em] text-[var(--lp-dim)]">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none" style={{ background: color }} />
        <span className="relative inline-flex size-2 rounded-full" style={{ background: color }} />
      </span>
      <span className="text-[var(--lp-chalk)]">
        Cue {current ? pad(cue + 1) : "00"} / {pad(CUES.length)}
      </span>
      <span className="hidden sm:inline">{current ? `${current.day} · ${current.title}` : "Avant-show · salle ouverte"}</span>
      <span className="ml-auto tabular-nums">
        TC <span ref={tc}>00:00:00:00</span>
      </span>
    </div>
  );
}

/** Cadre incliné en perspective qui suit le pointeur. */
export function TiltFrame({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${x * 10}deg`);
    el.style.setProperty("--rx", `${-y * 8}deg`);
  };
  const onLeave = () => {
    ref.current?.style.removeProperty("--ry");
    ref.current?.style.removeProperty("--rx");
  };
  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={`lp-tilt ${className ?? ""}`}>
      {children}
    </div>
  );
}

/**
 * Console de régie : un bouton par cue. Le cue actif est allumé ; un clic amène la carte au
 * centre de l'écran, ce qui déclenche le programme lumière correspondant.
 */
export function CueConsole() {
  const cue = useActiveCue();
  const go = (index: number) => {
    const el = document.querySelector<HTMLElement>(`[data-cue="${index}"]`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  };
  return (
    <nav aria-label="Console de régie" className="pointer-events-auto rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-panel)] p-3 backdrop-blur-md">
      <p className="lp-eyebrow px-2 pb-2 pt-1">Console</p>
      <ol className="flex flex-col gap-0.5">
        {CUES.map((c, i) => {
          const active = i === cue;
          const color = c.light.colors[0];
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={active ? "step" : undefined}
                className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
              >
                <span
                  aria-hidden
                  className="h-5 w-1 rounded-full transition-all duration-300"
                  style={{ background: active ? color : "rgb(243 239 249 / 0.15)", boxShadow: active ? `0 0 12px ${color}` : "none" }}
                />
                <span className={`lp-mono w-11 text-xs tabular-nums ${active ? "text-[var(--lp-chalk)]" : "text-[var(--lp-dim)]"}`}>{c.day}</span>
                <span className={`truncate text-sm transition-colors ${active ? "text-[var(--lp-chalk)]" : "text-[var(--lp-dim)] group-hover:text-[var(--lp-chalk)]"}`}>{c.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
