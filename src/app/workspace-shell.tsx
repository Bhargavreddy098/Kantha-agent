"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { defaultThemeSlug, themes } from "@/astryx-themes";
import { GatewayAccessGate } from "@/components/gateway/gateway-access-gate";
import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { Theme } from "@astryxdesign/core/theme";

const destinations = [
  { href: "/chat", label: "Chat", icon: "viewColumns" },
  { href: "/settings", label: "Settings", icon: "wrench" },
] as const;

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <Theme theme={themes[defaultThemeSlug]}>
      <AppShell
        variant="section"
        topNav={
          <TopNav
            label=""
            heading={<TopNavHeading heading="" headingHref="/chat" as={NextLink} />}
          />
        }
        sideNav={
          <SideNav aria-label="Workspace navigation" collapsible>
            <SideNavSection title="Workspace">
              {destinations.map(({ href, label, icon }) => (
                <SideNavItem
                  key={href}
                  as={NextLink}
                  href={href}
                  label={label}
                  icon={icon}
                  isSelected={pathname === href}
                />
              ))}
            </SideNavSection>
          </SideNav>
        }
      >
        <GatewayAccessGate>{children}</GatewayAccessGate>
      </AppShell>
    </Theme>
  );
}
