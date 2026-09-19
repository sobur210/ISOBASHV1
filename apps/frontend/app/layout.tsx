import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ISOBASH | Your AI. Your Agents. Your Workspace.",
  description: "An AI operating platform for chat, agents, memory, projects, research, media, and more.",
};

const themeScript = `(function(){try{var t=document.cookie.match(/(?:^|; )isobash_theme=([^;]*)/);var c=t&&t[1];var dark=c?c==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var h=document.documentElement;if(dark){h.classList.add('dark')}else{h.classList.remove('dark')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}