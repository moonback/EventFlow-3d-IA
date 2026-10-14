"use client";
import { Copy, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { apiFetch, errorMessage } from "@/lib/api-client";

/** Ouverture du formulaire public de demande de devis et code d'intégration pour le site de l'agence. */
export function PublicFormCard({ enabled, url }: { enabled: boolean; url: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const embed = `<iframe src="${url}" title="Demande de devis" style="width:100%;min-height:900px;border:0" loading="lazy"></iframe>`;

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await apiFetch("/api/settings/public-form", { method: "PUT", body: { enabled: next } });
      toast.success(next ? "Formulaire public ouvert" : "Formulaire public fermé");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copié`);
    } catch {
      toast.error("Copie impossible : sélectionnez le texte manuellement");
    }
  };

  return (
    <Card id="formulaire-public" className="mt-4">
      <CardHeader>
        <CardTitle>Formulaire public de demande de devis</CardTitle>
        <CardDescription>
          Une page publique, intégrable sur votre site, où vos prospects décrivent leur événement. Chaque demande crée une opportunité et notifie les commerciaux.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <label className="flex items-center gap-3">
          <Switch checked={enabled} disabled={busy} onCheckedChange={(v) => void toggle(v)} aria-label="Ouvrir le formulaire public" />
          <span>{enabled ? "Formulaire ouvert au public" : "Formulaire fermé (la page répond « introuvable »)"}</span>
        </label>
        {enabled ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-muted px-2 py-1 text-xs break-all">{url}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => void copy(url, "Lien")}>
                <Copy /> Copier le lien
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Ouvrir
                </a>
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Code d&apos;intégration (iframe) à coller sur votre site :</span>
              <Textarea readOnly rows={3} value={embed} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <div>
                <Button type="button" size="sm" variant="outline" onClick={() => void copy(embed, "Code")}>
                  <Copy /> Copier le code
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
