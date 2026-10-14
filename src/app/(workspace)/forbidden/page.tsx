import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Accès refusé" };

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-warning/10">
        <ShieldAlert className="size-6 text-warning" aria-hidden />
      </div>
      <div>
        <h1 className="text-lg font-semibold">Accès refusé</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">Votre rôle ne permet pas d&apos;accéder à ce module. Contactez un administrateur si nécessaire.</p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Retour au tableau de bord</Link>
      </Button>
    </div>
  );
}
