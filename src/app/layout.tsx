// The global stylesheets load first: layers.css names the cascade layers, and
// globals.css carries the Tailwind and Astryx base styles they order.
import "./layers.css";
import "./globals.css";

import type { Metadata } from "next";
import { Theme } from "@astryxdesign/core/theme";
import { themes, defaultThemeSlug } from "@/astryx-themes";

export const metadata: Metadata = {
  title: "Kantha",
  description: "Chat and manage your workspace AI gateway.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      className="h-full antialiased"
    >
      <body className="h-full overflow-hidden flex flex-col bg-white text-neutral-900">
        <Theme theme={themes[defaultThemeSlug]} mode="light">{children}</Theme>
      </body>
    </html>
  );
}
