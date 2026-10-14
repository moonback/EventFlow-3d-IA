import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/misc";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EventFlow 3D", template: "%s · EventFlow 3D" },
  description: "ERP / CRM pour agence événementielle avec pilotage 3D",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e1424" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("ef_theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="fr" className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster theme={theme} richColors closeButton position="bottom-right" />
      </body>
    </html>
  );
}
