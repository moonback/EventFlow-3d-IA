import { PageHeader } from "@/components/feedback/page-header";
import { pageContext } from "@/server/auth/page";
import { env } from "@/lib/env";
import { getAssistantSettings, getOrganizationSettings } from "@/server/services/settings-service";
import { AssistantCard } from "./assistant-card";
import { PublicFormCard } from "./public-form-card";
import { OrganizationForm } from "./organization-form";

export const metadata = { title: "Organisation" };

export default async function OrganizationPage() {
  const ctx = await pageContext("settings:manage");
  const [o, assistant] = await Promise.all([getOrganizationSettings(ctx), getAssistantSettings(ctx)]);
  return (
    <>
      <PageHeader title="Organisation" breadcrumbs={[{ label: "Paramètres", href: "/settings" }, { label: "Organisation" }]} />
      <OrganizationForm
        initial={{
          name: o.name, legalName: o.legalName ?? "", siret: o.siret ?? "", vatNumber: o.vatNumber ?? "", email: o.email ?? "", phone: o.phone ?? "", addressLine1: o.addressLine1 ?? "",
          addressLine2: o.addressLine2 ?? "", postalCode: o.postalCode ?? "", city: o.city ?? "", country: o.country, timezone: o.timezone, defaultVatRate: o.defaultVatRate,
          paymentTermDays: o.paymentTermDays, prepBufferHours: o.prepBufferHours, returnBufferHours: o.returnBufferHours, quoteValidityDays: o.quoteValidityDays,
          quoteFooter: o.quoteFooter ?? "", invoiceFooter: o.invoiceFooter ?? "", latePenaltyText: o.latePenaltyText ?? "", accentColor: o.accentColor,
        }}
      />
      <PublicFormCard enabled={o.publicRequestFormEnabled} url={`${env().APP_URL}/demande/${o.slug}`} />
      <AssistantCard initial={assistant} />
    </>
  );
}
