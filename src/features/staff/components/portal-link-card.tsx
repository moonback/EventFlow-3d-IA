"use client";
import { Copy, Link2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ActionButton } from "@/components/feedback/action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/dates";

/** Lien d'accès limité au portail prestataire : envoi par e-mail, copie, révocation. */
export function PortalLinkCard({ staffId, hasEmail, activeLinks, lastUsedAt, tz }: { staffId: string; hasEmail: boolean; activeLinks: number; lastUsedAt: string | null; tz: string }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const issue = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ link: string; mail: { status: string } | null }>(`/api/staff/${staffId}/portal-link`, { method: "POST" });
      setLink(res.link);
      const sent = res.mail && (res.mail.status === "sent" || res.mail.status === "stored");
      toast.success(sent ? "Lien envoyé par e-mail" : "Lien créé : copiez-le pour le transmettre");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Lien copié");
    } catch {
      toast.error("Copie impossible : sélectionnez le lien manuellement");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Link2 className="size-4" aria-hidden /> Portail prestataire
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          {activeLinks > 0 ? `${activeLinks} lien${activeLinks > 1 ? "s" : ""} actif${activeLinks > 1 ? "s" : ""}` : "Aucun lien actif"}
          {lastUsedAt ? ` · dernière visite ${formatDateTime(lastUsedAt, tz)}` : ""}
        </p>
        <Button size="sm" onClick={issue} loading={loading}>
          <Send /> {hasEmail ? "Envoyer le lien par e-mail" : "Créer un lien"}
        </Button>
        {link ? (
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Lien du portail" data-testid="portal-link" onFocus={(e) => e.currentTarget.select()} />
            <Button size="icon" variant="outline" onClick={copy} aria-label="Copier le lien">
              <Copy />
            </Button>
          </div>
        ) : null}
        {activeLinks > 0 ? (
          <ActionButton url={`/api/staff/${staffId}/portal-link`} method="DELETE" size="sm" variant="ghost" successMessage="Liens révoqués" confirm={{ title: "Révoquer tous les liens du portail ?", description: "Les liens déjà envoyés cesseront immédiatement de fonctionner.", destructive: true }}>
            Révoquer tous les liens
          </ActionButton>
        ) : null}
      </CardContent>
    </Card>
  );
}
