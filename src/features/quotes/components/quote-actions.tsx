"use client";
import { CheckCircle2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/misc";
import { apiFetch, errorMessage } from "@/lib/api-client";

const MAIL_STATUS: Record<string, string> = {
  sent: "E-mail accepté par le fournisseur d'envoi",
  stored: "E-mail déposé dans la boîte de développement (storage/mail-outbox) — non envoyé réellement",
  disabled: "Envoi d'e-mails désactivé : le devis n'a pas été envoyé",
  failed: "Échec de l'envoi : le devis n'a pas été envoyé",
};

/** Envoi par e-mail : uniquement sur action explicite, résultat réel du fournisseur affiché. */
export function SendQuoteButton({ quoteId, email }: { quoteId: string; email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const send = async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ mail: { status: string } }>(`/api/quotes/${quoteId}/send`, { method: "POST", body: {} });
      const msg = MAIL_STATUS[r.mail.status] ?? r.mail.status;
      if (r.mail.status === "sent" || r.mail.status === "stored") toast.success(msg);
      else toast.warning(msg);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!email}>
          <Mail /> Envoyer par e-mail
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer le devis</DialogTitle>
          <DialogDescription>Le devis (PDF) sera envoyé à {email}. Un devis brouillon est d&apos;abord émis (il ne sera plus modifiable).</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={send} loading={loading}>
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AcceptQuoteButton({ quoteId, hasEvent }: { quoteId: string; hasEvent: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createReservation, setCreate] = useState(hasEvent);
  const [loading, setLoading] = useState(false);
  const accept = async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ reservationId: string | null }>(`/api/quotes/${quoteId}/accept`, { method: "POST", body: { createReservation } });
      toast.success(r.reservationId ? "Devis accepté — réservation brouillon créée" : "Devis accepté");
      setOpen(false);
      if (r.reservationId) router.push(`/reservations/${r.reservationId}`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      router.refresh();
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 /> Accepté par le client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enregistrer l&apos;acceptation</DialogTitle>
          <DialogDescription>Les autres versions envoyées de ce devis seront annulées et l&apos;événement confirmé.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={createReservation} disabled={!hasEvent} onCheckedChange={(c) => setCreate(c === true)} />
          Transformer les lignes matériel en réservation (brouillon, à confirmer)
        </label>
        {!hasEvent ? <p className="text-xs text-muted-foreground">Associez le devis à un événement pour générer une réservation.</p> : null}
        <DialogFooter>
          <Button onClick={accept} loading={loading}>
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
