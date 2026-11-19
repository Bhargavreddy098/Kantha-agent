"use client";

import { ModelProviders } from "@/app/model-providers/model-providers";
import { GatewaySignOut } from "@/components/gateway/gateway-access-gate";
import { GatewayStatusPanel } from "@/components/gateway/gateway-status-panel";
import { UsageView } from "@/components/gateway/usage-view";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

export default function SettingsPage() {
  return (
    <Stack maxWidth={900} gap={5} padding={4}>
      <Heading level={1}>Settings</Heading>
      <Card padding={4}>
        <VStack gap={3}>
          <Heading level={2}>Workspace</Heading>
          <Stack direction="horizontal" gap={2} wrap="wrap">
            <Button label="Model providers" variant="secondary" href="#model-providers" />
            <GatewaySignOut />
          </Stack>
        </VStack>
      </Card>
      <GatewayStatusPanel />
      <UsageView />
      <Card padding={4}>
        <VStack gap={3}>
          <Heading level={2}>Help</Heading>
          <Collapsible defaultIsOpen={false} trigger={<Text>Where is my history stored?</Text>}>
            <Text as="p">This browser stores your conversation history and attachments. The gateway keeps the messages it needs to run and recover a response.</Text>
          </Collapsible>
          <Collapsible defaultIsOpen={false} trigger={<Text>Why is a model missing?</Text>}>
            <Text as="p">Ask a workspace owner to check that its connection is active and that the model appears in the connection’s eligible models.</Text>
          </Collapsible>
        </VStack>
      </Card>
      <section id="model-providers" aria-label="Model providers">
        <Card padding={4}>
          <ModelProviders embedded />
        </Card>
      </section>
    </Stack>
  );
}
