import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LandingPage } from "@/features/landing/landing-page";

export const metadata: Metadata = {
  title: { absolute: "EventFlow 3D — ERP et CRM pour agences événementielles" },
  description: "Matériel, équipes, véhicules, devis et factures dans une seule application, et votre agence entière en 3D.",
  robots: { index: true, follow: true },
};

/** Page d'accueil publique. Un visiteur déjà connecté se voit proposer d'ouvrir son espace. */
export default async function Home() {
  const signedIn = Boolean((await cookies()).get("ef_session")?.value);
  return <LandingPage signedIn={signedIn} />;
}
