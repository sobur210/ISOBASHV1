import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "ISOBASH — Your AI. Your Agents. Your Workspace.",
    template: "%s | ISOBASH",
  },
  description:
    "An AI operating platform for chat, agents, memory, projects, research, files and media — provider-agnostic, running locally, in the cloud, or both.",
  keywords: ["AI platform", "AI agents", "local AI", "Ollama", "chat", "research", "automation"],
  openGraph: {
    title: "ISOBASH — Your AI. Your Agents. Your Workspace.",
    description:
      "Chat, reasoning, autonomous agents, memory, projects, research, files and media on a provider-agnostic engine.",
    type: "website",
    siteName: "ISOBASH",
  },
  twitter: {
    card: "summary_large_image",
    title: "ISOBASH — Your AI. Your Agents. Your Workspace.",
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
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )isobash_theme=([^;]*)/);var c=m&&m[1];if(c==='light'){document.documentElement.classList.add('light')}else{document.documentElement.classList.remove('light')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
