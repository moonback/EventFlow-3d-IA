import type { ReactNode } from "react";

/** Mise en page du formulaire public : sobre, sans navigation, pensée pour être intégrée en iframe. */
export default function PublicRequestLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh px-4 py-8">
      <div className="relative mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}
