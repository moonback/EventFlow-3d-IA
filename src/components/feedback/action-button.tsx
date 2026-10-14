"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Button, type ButtonProps } from "../ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";

/**
 * Bouton d'action serveur : appelle une route API, affiche le résultat et rafraîchit la page
 * UNIQUEMENT après confirmation du serveur. Confirmation facultative pour les actions importantes.
 */
export function ActionButton({
  url,
  method = "POST",
  body,
  children,
  confirm,
  successMessage = "Action effectuée",
  redirectTo,
  onDone,
  ...buttonProps
}: Omit<ButtonProps, "onClick"> & {
  url: string;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  children: ReactNode;
  confirm?: { title: string; description: ReactNode; confirmLabel?: string; destructive?: boolean };
  successMessage?: string;
  /** Chemin fixe, ou { prefix } pour rediriger vers `${prefix}/${id renvoyé par l'API}` (sérialisable depuis un composant serveur) */
  redirectTo?: string | { prefix: string };
  onDone?: (data: unknown) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const data = await apiFetch(url, { method, body: body ?? {} });
      toast.success(successMessage);
      setOpen(false);
      onDone?.(data);
      if (redirectTo) {
        const id = (data as { id?: string } | null)?.id;
        router.push(typeof redirectTo === "string" ? redirectTo : `${redirectTo.prefix}/${id ?? ""}`);
      }
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  if (!confirm) {
    return (
      <Button {...buttonProps} loading={loading} onClick={run}>
        {children}
      </Button>
    );
  }
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button {...buttonProps}>{children}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{confirm.description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            destructive={confirm.destructive}
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            {loading ? "En cours…" : (confirm.confirmLabel ?? "Confirmer")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
