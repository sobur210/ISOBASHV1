import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { WEB_URL } from "@/lib/config";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Env-driven so it cannot drift from the dev port pinned in package.json.
  // Falls back to 3002, which is what `next dev` is pinned to.
  metadataBase: new URL(WEB_URL),
  // A static file in `public/`, not `app/manifest.ts`: the gateway rewrite in
  // next.config.ts runs in the `afterFiles` phase, which is checked *before*
  // dynamic routes, so a manifest route handler would be forwarded to the API
  // instead of being served. `public/` wins because the filesystem is checked
  // first.
  manifest: "/manifest.webmanifest",
  // No `icons` override: `app/icon.png` is the square monogram and Next serves
  // it at /icon.png by convention, stamping sizes from the file (512x512).
  // Pointing this at `/logo.png` instead handed the browser the 2051x767
  // wordmark, which rendered as a squashed, unreadable tab icon.
  title: {
    default: "ISOBASH: Your AI. Your Agents. Your Workspace.",
    template: "%s | ISOBASH",
  },
  description:
    "An AI operating platform for chat, agents, memory, projects, research, files and media. Provider-agnostic, running locally, in the cloud, or both.",
  keywords: ["AI platform", "AI agents", "local AI", "Ollama", "chat", "research", "automation"],
  openGraph: {
    title: "ISOBASH: Your AI. Your Agents. Your Workspace.",
    description:
      "Chat, reasoning, autonomous agents, memory, projects, research, files and media on a provider-agnostic engine.",
    type: "website",
    siteName: "ISOBASH",
  },
  twitter: {
    card: "summary_large_image",
    title: "ISOBASH: Your AI. Your Agents. Your Workspace.",
    description: "A provider-agnostic AI operating platform that runs locally, in the cloud, or both.",
  },
};

export const viewport: Viewport = {
  // color-scheme is set in globals.css so it tracks the .light class, not the OS.
  themeColor: "#05070f",
};

/**
 * Runs before paint so the resolved theme is already on <html> and the
 * first frame never flashes the wrong palette. Dark is the brand default.
 */
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )isobash_theme=([^;]*)/);var c=m&&m[1];if(!c){c=localStorage.getItem('isobash_theme')}if(c==='light'){document.documentElement.classList.add('light')}else{document.documentElement.classList.remove('light')}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts mints this per request; Next.js stamps it onto its own inline
  // scripts, and we have to stamp it on ours by hand or CSP refuses it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
