import { Boxes } from "lucide-react";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-primary)_0%,transparent_55%)] opacity-15" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] bg-[size:48px_48px] opacity-40" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-xl shadow-primary/30">
            <Boxes className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xl font-semibold tracking-tight">
              EventFlow <span className="text-primary">3D</span>
            </p>
            <p className="text-sm text-muted-foreground">Pilotage d&apos;agence événementielle</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur">{children}</div>
      </div>
    </div>
  );
}
