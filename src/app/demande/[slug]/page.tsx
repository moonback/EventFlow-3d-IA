import { notFound } from "next/navigation";
import { PublicRequestForm } from "@/features/opportunities/components/public-request-form";
import { isAppError } from "@/lib/errors";
import { getPublicRequestForm } from "@/server/services/opportunity-service";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  try {
    return await getPublicRequestForm(slug);
  } catch (e) {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await load(slug);
  return { title: `Demande de devis — ${form.name}`, robots: { index: false, follow: false } };
}

export default async function PublicRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await load(slug);
  return <PublicRequestForm slug={slug} organizationName={form.name} accentColor={form.accentColor} eventTypes={form.eventTypes} />;
}
