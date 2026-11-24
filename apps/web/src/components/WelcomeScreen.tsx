import React from "react";
import {
  Button,
  ClickableCard,
  Divider,
  Grid,
  Heading,
  HStack,
  Text,
  VStack,
} from "@astryxdesign/core";
import { ArrowUpRight, Compass, Cpu, FileSearch, Layers, Terminal } from "lucide-react";

export interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  onLaunchHarness?: (prompt?: string) => void;
}

const PROMPT_SUGGESTIONS = [
  {
    index: "01",
    icon: Cpu,
    title: "Gateway Resilience",
    description:
      "Explain circuit breakers, exponential backoff, and model failover for free OpenRouter tiers.",
    prompt:
      "Explain how per-model circuit breakers, retry-after backoff, and zero-token failover chains keep an LLM gateway reliable under rate limits.",
  },
  {
    index: "02",
    icon: Layers,
    title: "Multi-Phase Orchestrator",
    description:
      "Outline Plan -> Execute -> Verify loops with parallel read batching and approval-gated writes.",
    prompt:
      "Design a concise Plan -> Execute -> Verify agent harness that executes read-only tools in parallel and gates file writes behind durable approvals.",
  },
  {
    index: "03",
    icon: Compass,
    title: "Swiss Typographic Grid",
    description:
      "Apply Josef Müller-Brockmann grid systems and Geist typography to engineering interfaces.",
    prompt:
      "Summarize the core structural principles of the Swiss International Typographic Style applied to high-density developer workbenches.",
  },
  {
    index: "04",
    icon: FileSearch,
    title: "Context Compaction",
    description:
      "Compare sliding-window and tool-output summarization strategies for long coding runs.",
    prompt:
      "Compare strategies for compacting large historical tool outputs in multi-turn coding agents while preserving critical reasoning context.",
  },
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectPrompt,
  onLaunchHarness,
}) => {
  return (
    <VStack
      gap="24px"
      style={{
        maxWidth: "880px",
        margin: "0 auto",
        padding: "44px 28px 32px 28px",
        width: "100%",
      }}
    >
      {/* Swiss Editorial Header Block */}
      <VStack gap="12px">
        <Text
          size="xs"
          weight="semibold"
          style={{
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--swiss-accent)",
          }}
        >
          KANTHA WORKBENCH — SWISS EDITORIAL STUDIO
        </Text>

        <Heading
          level={1}
          style={{
            fontSize: "34px",
            lineHeight: 1.12,
            letterSpacing: "-0.03em",
            fontWeight: 700,
            color: "var(--swiss-text)",
            margin: 0,
          }}
        >
          Precision inference & autonomous workspace orchestration.
        </Heading>

        <Text
          size="md"
          style={{
            color: "var(--swiss-text-secondary)",
            maxWidth: "620px",
            lineHeight: 1.6,
          }}
        >
          Routed through the hardened Kantha Gateway with circuit breakers, OpenRouter free-tier
          failover, and a 10-tool Plan → Execute → Verify harness.
        </Text>

        {onLaunchHarness && (
          <HStack gap="10px" style={{ paddingTop: "4px" }}>
            <Button
              label="Open Harness Orchestrator"
              variant="primary"
              size="md"
              icon={<Terminal size={15} />}
              onClick={() => onLaunchHarness()}
            >
              Open Harness Orchestrator
            </Button>
            <Button
              label="Run Workspace Audit in Harness"
              variant="secondary"
              size="md"
              onClick={() =>
                onLaunchHarness(
                  "Inspect this workspace using inspect_workspace and git_status, then summarize the monorepo packages and architecture in a concise table."
                )
              }
            >
              Run Workspace Audit
            </Button>
          </HStack>
        )}
      </VStack>

      <Divider />

      {/* Strict 2x2 Swiss Grid of ClickableCards */}
      <VStack gap="12px" style={{ width: "100%" }}>
        <Text
          size="xs"
          weight="semibold"
          style={{
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--swiss-text-secondary)",
          }}
        >
          DIRECT CHAT PROMPTS
        </Text>

        <Grid columns={{ minWidth: 280, max: 2 }} gap={12} width="100%">
          {PROMPT_SUGGESTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <ClickableCard
                key={item.title}
                label={item.title}
                variant="default"
                padding={16}
                onClick={() => onSelectPrompt(item.prompt)}
                style={{
                  border: "1px solid var(--swiss-border)",
                  borderRadius: "2px",
                  backgroundColor: "var(--swiss-surface)",
                }}
              >
                <VStack gap="12px" style={{ width: "100%" }}>
                  <HStack justify="space-between" align="center" style={{ width: "100%" }}>
                    <HStack align="center" gap="8px">
                      <Text
                        size="xs"
                        hasTabularNumbers
                        weight="semibold"
                        style={{
                          fontFamily: "var(--font-mono)",
                          color: "var(--swiss-accent)",
                        }}
                      >
                        {item.index}
                      </Text>
                      <Icon size={15} style={{ color: "var(--swiss-text)" }} />
                    </HStack>
                    <ArrowUpRight size={14} style={{ color: "var(--swiss-text-secondary)" }} />
                  </HStack>

                  <VStack gap="4px">
                    <Text size="sm" weight="semibold" style={{ color: "var(--swiss-text)" }}>
                      {item.title}
                    </Text>
                    <Text
                      size="xs"
                      style={{
                        color: "var(--swiss-text-secondary)",
                        lineHeight: 1.5,
                      }}
                    >
                      {item.description}
                    </Text>
                  </VStack>
                </VStack>
              </ClickableCard>
            );
          })}
        </Grid>
      </VStack>
    </VStack>
  );
};
