import { Boxes } from "lucide-react";
import type { ReactNode } from "react";

/** Mise en page du portail prestataire : publique, sans navigation vers l'espace de travail. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden px-4 py-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-primary)_0%,transparent_55%)] opacity-10" />
      <div className="relative mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-lg shadow-primary/30">
            <Boxes className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold tracking-tight">
              EventFlow <span className="text-primary">3D</span>
            </p>
            <p className="text-xs text-muted-foreground">Portail prestataires</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
