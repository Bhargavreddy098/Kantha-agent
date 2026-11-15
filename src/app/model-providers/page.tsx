"use client";

import { DashboardShell } from "@/components/block/dashboard-shell";
import { navigation, secondaryNavigation } from "@/components/block/dashboard-shell-config";
import { ModelProvidersView } from "@/components/block/model-providers-view";
import { GatewayAccessGate } from "@/components/gateway/gateway-access-gate";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ModelProvidersPage() {
  const router = useRouter();

  return (
    <DashboardShell
      brand={{ name: "ObsidianUI", description: "Model Providers" }}
      navigation={navigation}
      secondaryNavigation={secondaryNavigation}
      activeItemId="settings"
      title="Model Providers"
      sidebarWidth={240}
      defaultSidebarWidth={240}
      linkComponent={Link}
    >
      <GatewayAccessGate>
        <ModelProvidersView
          showBackButton
          onBack={() => {
            if (window.history.length > 1) router.back();
            else router.push("/settings");
          }}
        />
      </GatewayAccessGate>
    </DashboardShell>
  );
}
