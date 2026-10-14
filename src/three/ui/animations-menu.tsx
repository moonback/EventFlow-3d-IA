"use client";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { ANIMATIONS, useAnimationSettings, type AnimationSettings } from "../effects/motion";

/**
 * Choix des animations de la scène, une par une (mémorisé dans ce navigateur, commun au monde 3D,
 * à l'accueil et au mur d'écrans). Une animation décochée est masquée ou figée selon son type.
 */
export function AnimationsMenu({ quality }: { quality: "low" | "medium" | "high" }) {
  const [settings, setSettings] = useAnimationSettings();
  const enabled = ANIMATIONS.filter((a) => settings[a.key]).length;
  const setAll = (on: boolean) => setSettings(Object.fromEntries(ANIMATIONS.map((a) => [a.key, on])) as AnimationSettings);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="Choisir les animations affichées">
          <Sparkles /> Animations{" "}
          <span className="text-muted-foreground tabular-nums">
            {enabled}/{ANIMATIONS.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Animations</p>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setAll(true)} disabled={enabled === ANIMATIONS.length}>
              Tout
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAll(false)} disabled={enabled === 0}>
              Aucune
            </Button>
          </div>
        </div>
        <ul className="mt-2 flex flex-col gap-0.5">
          {ANIMATIONS.map((a) => {
            const id = `anim-${a.key}`;
            return (
              <li key={a.key}>
                <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent">
                  <Checkbox id={id} checked={settings[a.key]} onCheckedChange={(v) => setSettings({ ...settings, [a.key]: v === true })} />
                  <span className="min-w-0 flex-1">{a.label}</span>
                  {!settings[a.key] ? <span className="text-xs text-muted-foreground">{a.effect}</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
          Réglage mémorisé dans ce navigateur, commun au monde 3D, à l&apos;accueil et au mur d&apos;écrans.
          {quality === "low" ? " En qualité basse, seules les animations légères (liens, caisses, clignotements) restent actives." : ""} Le réglage « réduire les animations » du système les coupe toutes.
        </p>
      </PopoverContent>
    </Popover>
  );
}
