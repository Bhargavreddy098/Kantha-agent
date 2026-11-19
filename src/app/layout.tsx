import "./layers.css";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { WebVitals } from "./web-vitals";
import { WorkspaceShell } from "./workspace-shell";

const inter = localFont({
  src: "./fonts/Inter.woff",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: "AI Workspace",
  description: "Chat workspace and gateway settings.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className={inter.className}>
        {process.env.NEXT_PUBLIC_REPORT_WEB_VITALS === "1" && <WebVitals />}
        <WorkspaceShell>{children}</WorkspaceShell>
      </body>
    </html>
  );
}
