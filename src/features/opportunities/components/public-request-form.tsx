"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarHeart, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";
import { publicQuoteRequestSchema, type PublicQuoteRequestInput } from "../schemas";

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Formulaire public de demande de devis. Le champ « website » est un piège à robots : masqué
 * aux humains (et aux lecteurs d'écran), il doit rester vide.
 */
export function PublicRequestForm({
  slug,
  organizationName,
  accentColor,
  eventTypes,
}: {
  slug: string;
  organizationName: string;
  accentColor: string;
  eventTypes: { id: string; name: string }[];
}) {
  const [startedAt] = useState(() => Date.now());
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PublicQuoteRequestInput>({
    resolver: zodResolver(publicQuoteRequestSchema),
    defaultValues: { contactName: "", contactEmail: "", contactPhone: "", companyName: "", eventTypeId: "", eventDate: "", venue: "", budget: "", message: "", website: "" },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await apiFetch(`/api/public/requests/${encodeURIComponent(slug)}`, { method: "POST", body: { ...values, startedAt } });
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [name, messages] of Object.entries(error.fieldErrors)) {
          if (messages?.[0]) form.setError(name as Path<PublicQuoteRequestInput>, { message: messages[0] });
        }
      }
      setFormError(errorMessage(error));
    }
  });

  if (sent) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-10 text-emerald-500" aria-hidden />
          <h1 className="text-lg font-semibold">Demande envoyée</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Merci ! L&apos;équipe de {organizationName} a bien reçu votre demande et reviendra vers vous rapidement.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card style={{ borderTop: `4px solid ${accentColor}` }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarHeart className="size-5" style={{ color: accentColor }} aria-hidden />
          Demande de devis
        </CardTitle>
        <CardDescription>Décrivez votre événement : {organizationName} vous répond avec une proposition sur mesure.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={onSubmit}>
          {formError ? (
            <Alert tone="danger" className="sm:col-span-2">
              {formError}
            </Alert>
          ) : null}
          <Field label="Date de l'événement" error={e.eventDate?.message} required>
            <Input type="date" min={todayIso()} {...form.register("eventDate")} />
          </Field>
          <Field label="Type d'événement" error={e.eventTypeId?.message}>
            <NativeSelect {...form.register("eventTypeId")}>
              <option value="">— Choisir —</option>
              {eventTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Lieu ou ville" error={e.venue?.message} required>
            <Input autoComplete="address-level2" {...form.register("venue")} />
          </Field>
          <Field label="Nombre d'invités" error={e.guestCount?.message} required>
            <Input type="number" min={1} inputMode="numeric" {...form.register("guestCount")} />
          </Field>
          <Field label="Budget indicatif (€ HT)" error={e.budget?.message} hint="Facultatif">
            <Input inputMode="decimal" {...form.register("budget")} />
          </Field>
          <Field label="Société" error={e.companyName?.message} hint="Facultatif">
            <Input autoComplete="organization" {...form.register("companyName")} />
          </Field>
          <Field label="Nom et prénom" error={e.contactName?.message} required>
            <Input autoComplete="name" {...form.register("contactName")} />
          </Field>
          <Field label="E-mail" error={e.contactEmail?.message} required>
            <Input type="email" autoComplete="email" {...form.register("contactEmail")} />
          </Field>
          <Field label="Téléphone" error={e.contactPhone?.message} hint="Facultatif">
            <Input type="tel" autoComplete="tel" {...form.register("contactPhone")} />
          </Field>
          <Field label="Votre projet" error={e.message?.message} className="sm:col-span-2">
            <Textarea rows={4} placeholder="Ambiance, horaires, prestations souhaitées…" {...form.register("message")} />
          </Field>
          {/* Piège à robots : hors écran, ignoré au clavier et par les lecteurs d'écran */}
          <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
            <label>
              Site web
              <input type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" aria-describedby={e.consent?.message ? "consent-error" : undefined} className="mt-0.5 size-4 accent-[var(--color-primary)]" {...form.register("consent")} />
              <span>J&apos;accepte que mes coordonnées soient utilisées par {organizationName} pour répondre à ma demande.</span>
            </label>
            {e.consent?.message ? (
              <p id="consent-error" role="alert" className="mt-1 text-xs text-destructive">
                {e.consent.message}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={form.formState.isSubmitting} style={{ backgroundColor: accentColor }}>
              Envoyer ma demande
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
