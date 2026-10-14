"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center" role="alert">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" aria-hidden />
      </div>
      <div>
        <h1 className="text-lg font-semibold">Impossible d&apos;afficher cette page</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">Une erreur est survenue lors du chargement des données. {error.digest ? `Référence : ${error.digest}` : null}</p>
      </div>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
