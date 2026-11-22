import React, { useState } from "react";
import { Collapsible } from "@astryxdesign/core";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";

export interface ThinkingPanelProps {
  reasoning: string;
  isStreaming?: boolean;
  defaultOpen?: boolean;
}

export const ThinkingPanel: React.FC<ThinkingPanelProps> = ({
  reasoning,
  isStreaming = false,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen || isStreaming);

  if (!reasoning && !isStreaming) {
    return null;
  }

  const triggerContent = (
    <div
      onClick={() => setIsOpen(!isOpen)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "8px 12px",
        cursor: "pointer",
        userSelect: "none",
        borderLeft: isStreaming ? "2px solid var(--swiss-accent)" : "2px solid var(--swiss-border)",
        backgroundColor: "var(--swiss-hover)",
        transition: "background-color 120ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Brain
          size={14}
          style={{
            color: isStreaming ? "var(--swiss-accent)" : "var(--swiss-text-secondary)",
          }}
        />
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: isStreaming ? "var(--swiss-text)" : "var(--swiss-text-secondary)",
          }}
        >
          {isStreaming ? "Thinking..." : "Thinking Process"}
        </span>

        {isStreaming && (
          <span
            style={{
              display: "inline-block",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "var(--swiss-accent)",
              marginLeft: "4px",
            }}
          />
        )}
      </div>

      <div style={{ color: "var(--swiss-text-secondary)", display: "flex", alignItems: "center" }}>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>
    </div>
  );

  return (
    <div
      style={{
        margin: "8px 0 16px 0",
        border: "1px solid var(--swiss-border)",
        borderLeft: "none",
        backgroundColor: "var(--swiss-bg)",
        overflow: "hidden",
      }}
    >
      <Collapsible
        trigger={triggerContent}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      >
        <div
          style={{
            padding: "12px 14px",
            borderLeft: isStreaming ? "2px solid var(--swiss-accent)" : "2px solid var(--swiss-border)",
            fontSize: "13px",
            lineHeight: 1.6,
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--swiss-text-secondary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "360px",
            overflowY: "auto",
          }}
        >
          {reasoning || (isStreaming ? "Analyzing request and structuring response..." : "")}
        </div>
      </Collapsible>
    </div>
  );
};
