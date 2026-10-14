"use client";
import { KeyRound, Mic, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/misc";
import { ASSISTANT_VOICES } from "@/features/settings/schemas";
import { apiFetch, errorMessage } from "@/lib/api-client";

export interface AssistantSettingsView {
  enabled: boolean;
  voice: string | null;
  maxSessionMinutes: number | null;
  /** Passerelle vocale activée sur le serveur (ASSISTANT_ENABLED) */
  serverEnabled: boolean;
  serverMaxSessionMinutes: number;
  apiKeyConfigured: boolean;
  /** 4 derniers caractères de la clé enregistrée (jamais la clé) */
  apiKeyHint: string | null;
  apiKeyUnreadable: boolean;
  /** APP_ENCRYPTION_KEY configurée : une clé peut être enregistrée */
  encryptionReady: boolean;
  /** Identifiants Gemini fournis par le serveur */
  serverCredentials: boolean;
}

/** Activation et réglages de l'assistant vocal Eric pour l'organisation. */
export function AssistantCard({ initial }: { initial: AssistantSettingsView }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [voice, setVoice] = useState(initial.voice ?? "");
  const [minutes, setMinutes] = useState(initial.maxSessionMinutes?.toString() ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  /** `apiKey` : undefined = inchangée, null = supprimée, chaîne = nouvelle clé */
  const save = async (next: { enabled: boolean; voice: string; minutes: string; apiKey?: string | null }, success: string) => {
    const parsedMinutes = next.minutes.trim() === "" ? null : Number(next.minutes);
    if (parsedMinutes !== null && (!Number.isInteger(parsedMinutes) || parsedMinutes < 1 || parsedMinutes > initial.serverMaxSessionMinutes)) {
      toast.error(`Durée maximale : nombre entier entre 1 et ${initial.serverMaxSessionMinutes} minutes`);
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/settings/assistant", { method: "PUT", body: { enabled: next.enabled, voice: next.voice || null, maxSessionMinutes: parsedMinutes, apiKey: next.apiKey } });
      toast.success(success);
      setApiKey("");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      setEnabled(initial.enabled);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (next: boolean) => {
    setEnabled(next);
    void save({ enabled: next, voice, minutes }, next ? "Assistant Eric activé" : "Assistant Eric désactivé");
  };

  return (
    <Card id="assistant" className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="size-4" aria-hidden /> Assistant vocal Eric
        </CardTitle>
        <CardDescription>
          Eric répond à la voix dans « Mon univers 3D » : questions sur l&apos;activité, navigation dans la scène et actions confirmées par un clic. Il n&apos;a jamais plus de droits que l&apos;utilisateur (permission « Parler à l&apos;assistant vocal Eric » de la matrice des permissions). Avec une clé API Gemini, la voix et les messages sont traités par l&apos;API Gemini de Google.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {!initial.serverEnabled ? (
          <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-foreground">
            La passerelle vocale n&apos;est pas activée sur le serveur (variable <code>ASSISTANT_ENABLED</code>, voir la documentation de déploiement). Vos réglages sont enregistrés et s&apos;appliqueront dès qu&apos;elle le sera.
          </p>
        ) : null}
        <label className="flex items-center gap-3">
          <Switch checked={enabled} disabled={busy} onCheckedChange={toggle} aria-label="Activer l'assistant vocal Eric" />
          <span>{enabled ? "Eric est activé pour l'organisation" : "Eric est désactivé (bouton masqué, conversations en cours interrompues)"}</span>
        </label>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const key = apiKey.trim();
            void save({ enabled, voice, minutes, apiKey: key ? key : undefined }, key ? "Clé API et réglages d'Eric enregistrés" : "Réglages d'Eric enregistrés");
          }}
        >
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="assistant-api-key" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" aria-hidden /> Clé API Gemini
            </Label>
            <Input
              id="assistant-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={initial.apiKeyConfigured ? "Laisser vide pour conserver la clé enregistrée" : "Clé de Google AI Studio (aistudio.google.com)"}
              value={apiKey}
              disabled={busy || !initial.encryptionReady}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {initial.apiKeyConfigured && !initial.apiKeyUnreadable ? <span>Clé enregistrée (se termine par « {initial.apiKeyHint} »). Elle est chiffrée et n&apos;est jamais réaffichée.</span> : null}
              {initial.apiKeyUnreadable ? <span className="text-destructive">La clé enregistrée est illisible (clé de chiffrement du serveur modifiée) : ressaisissez-la.</span> : null}
              {!initial.apiKeyConfigured ? (
                <span>{initial.serverCredentials ? "Aucune clé : Eric utilise les identifiants Gemini du serveur." : "Aucune clé : Eric ne pourra pas répondre tant qu'une clé n'est pas renseignée."}</span>
              ) : null}
              {!initial.encryptionReady ? <span className="text-destructive">Le serveur ne peut pas stocker de clé : APP_ENCRYPTION_KEY n&apos;est pas configurée.</span> : null}
              {initial.apiKeyConfigured ? (
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void save({ enabled, voice, minutes, apiKey: null }, "Clé API supprimée")}>
                  <Trash2 /> Supprimer la clé
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assistant-voice">Voix</Label>
            <NativeSelect id="assistant-voice" value={voice} disabled={busy} onChange={(e) => setVoice(e.target.value)}>
              <option value="">Voix par défaut du serveur</option>
              {ASSISTANT_VOICES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assistant-minutes">Durée maximale d&apos;une conversation (minutes)</Label>
            <Input id="assistant-minutes" type="number" inputMode="numeric" min={1} max={initial.serverMaxSessionMinutes} step={1} placeholder={`${initial.serverMaxSessionMinutes} (limite du serveur)`} value={minutes} disabled={busy} onChange={(e) => setMinutes(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              Enregistrer les réglages d&apos;Eric
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
