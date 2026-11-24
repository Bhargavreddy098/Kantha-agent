import React, { useState } from "react";
import { Card, Collapsible, Divider, HStack, Text } from "@astryxdesign/core";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";

export interface ThinkingPanelProps {
  reasoning: string;
  isStreaming?: boolean;
  defaultOpen?: boolean;
}

export const ThinkingPanel: React.FC<ThinkingPanelProps> = ({
  reasoning,
  isStreaming = false,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen || isStreaming);

  if (!reasoning && !isStreaming) {
    return null;
  }

  const triggerContent = (
    <HStack
      justify="space-between"
      align="center"
      style={{
        width: "100%",
        padding: "8px 12px",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <HStack align="center" gap="8px">
        <Brain
          size={14}
          style={{
            color: isStreaming ? "var(--swiss-accent)" : "var(--swiss-text-secondary)",
          }}
        />
        <Text
          size="xs"
          weight="semibold"
          style={{
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: isStreaming ? "var(--swiss-text)" : "var(--swiss-text-secondary)",
          }}
        >
          {isStreaming ? "Reasoning Trace (Active)" : "Reasoning Trace"}
        </Text>
      </HStack>

      <span style={{ color: "var(--swiss-text-secondary)", display: "flex", alignItems: "center" }}>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </span>
    </HStack>
  );

  return (
    <Card
      variant="muted"
      padding={0}
      style={{
        marginBottom: "14px",
        border: "1px solid var(--swiss-border)",
        borderRadius: "2px",
        backgroundColor: "var(--swiss-surface-muted)",
      }}
    >
      <Collapsible trigger={triggerContent} isOpen={isOpen} onOpenChange={setIsOpen}>
        <Divider />
        <div
          style={{
            padding: "12px 14px",
            fontSize: "12px",
            lineHeight: 1.6,
            fontFamily: "var(--font-mono)",
            color: "var(--swiss-text-secondary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "320px",
            overflowY: "auto",
          }}
        >
          {reasoning || (isStreaming ? "Synthesizing reasoning steps..." : "")}
        </div>
      </Collapsible>
    </Card>
  );
};
