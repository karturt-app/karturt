import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { AtmosphereBackdrop } from "@/components/atmosphere-backdrop";
import { getPublicAppUrl } from "@/lib/env";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const appUrl = getPublicAppUrl();
const themeBootstrap = `(()=>{const h=new Date(Date.now()+252e5).getUTCHours();let a=h>=4&&h<=8?"morning":h>=9&&h<=14?"day":h>=15&&h<=18?"afternoon":"night";try{const m=localStorage.getItem("karturt:atmosphere-mode");if(m==="morning"||m==="day"||m==="afternoon"||m==="night"||m==="rain")a=m}catch{}const d=a==="night"||a==="rain";const e=document.documentElement;e.dataset.theme=d?"dark":"light";e.dataset.atmosphere=a;e.classList.toggle("dark",d);e.classList.toggle("rain",a==="rain");e.classList.toggle("morning",a==="morning");e.classList.toggle("afternoon",a==="afternoon");e.style.colorScheme=d?"dark":"light"})()`;
const organizationData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "KartuRT",
  url: appUrl,
  logo: new URL("/icon.svg", appUrl).toString(),
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Administrasi iuran RT yang lebih jelas", template: "%s · KartuRT" },
  description: "KartuRT membantu warga dan pengurus melihat administrasi iuran RT dengan alur yang mudah dipahami.",
  applicationName: "KartuRT",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "KartuRT",
    title: "KartuRT — Administrasi warga, lebih jelas",
    description: "Informasi iuran RT dan administrasi warga dalam satu tempat.",
    images: [{ url: "/og-karturt.svg", width: 1200, height: 630, alt: "KartuRT — Administrasi warga, lebih jelas" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "KartuRT — Administrasi warga, lebih jelas",
    description: "Informasi iuran RT dan administrasi warga dalam satu tempat.",
    images: ["/og-karturt.svg"],
  },
  icons: { icon: "/icon.svg", apple: [{ url: "/pwa/rt05-apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  appleWebApp: { capable: true, title: "KartuRT", statusBarStyle: "default" },
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#173745",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${plusJakarta.variable} ${fraunces.variable} ${jetbrainsMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script id="karturt-theme-bootstrap" dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationData).replace(/</g, "\\u003c") }} />
      </head>
      <body>
        <AtmosphereBackdrop />
        {children}
      </body>
    </html>
  );
}
