import type { Metadata, Viewport } from "next";
import { Sora, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/shared/providers";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "LocaBénin — Location immobilière au Bénin : maisons, appartements meublés, bureaux",
    template: "%s | LocaBénin",
  },
  description:
    "Trouvez et louez un logement au Bénin : appartements, maisons, villas meublées et bureaux à Cotonou, Porto-Novo, Parakou et Calavi. Paiement sécurisé Mobile Money, contrats de location en ligne, propriétaires vérifiés.",
  keywords: ["location Bénin", "appartement Cotonou", "maison louer Cotonou", "appartement meublé Calavi", "bureau Porto-Novo", "immobilier Bénin", "location Parakou"],
  applicationName: "LocaBénin",
  manifest: "/manifest.json",
  openGraph: {
    title: "LocaBénin — La référence de la location immobilière au Bénin",
    description: "Appartements, maisons, meublés et bureaux à Cotonou, Porto-Novo, Parakou. Paiement Mobile Money sécurisé, propriétaires vérifiés.",
    siteName: "LocaBénin",
    type: "website",
    locale: "fr_BJ",
  },
  twitter: {
    card: "summary_large_image",
    title: "LocaBénin — Location immobilière au Bénin",
    description: "Trouvez votre logement au Bénin : Cotonou, Porto-Novo, Parakou, Calavi.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0B6B45",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${sora.variable} ${inter.variable} font-sans antialiased bg-background text-foreground min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
