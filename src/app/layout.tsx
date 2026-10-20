import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { THEME_BOOT_SCRIPT } from "@/components/shell/theme-script";
import { listProfiles } from "@/lib/db/profiles";
import { getSettings } from "@/lib/db/settings";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "VisionInspect Pro", template: "%s · VisionInspect Pro" },
  description: "Explainable AI for industrial quality inspection",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ed" },
    { media: "(prefers-color-scheme: dark)", color: "#141415" },
  ],
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const profiles = listProfiles().map(({ id, name, code }) => ({ id, name, code }));
  const settings = getSettings();
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans text-sm">
        <AppShell profiles={profiles} activeProfileId={settings.activeProfileId} exportFormat={settings.exportFormat}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
