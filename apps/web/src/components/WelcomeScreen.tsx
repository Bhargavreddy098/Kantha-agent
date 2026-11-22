import React from "react";
import { ArrowUpRight, Compass, Code2, FileText, Sparkles } from "lucide-react";

export interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
}

const PROMPT_SUGGESTIONS = [
  {
    icon: Compass,
    title: "Swiss International Style",
    description: "Explain the core grid and typographic principles of Josef Müller-Brockmann.",
    prompt: "Explain the core grid and typographic principles of Josef Müller-Brockmann and the International Typographic Style.",
  },
  {
    icon: Code2,
    title: "Architecture & Systems",
    description: "Design a clean decoupled architecture between a local daemon and web workbench.",
    prompt: "Design a clean decoupled architecture between a local Bun daemon and React web workbench adhering to Clean Architecture principles.",
  },
  {
    icon: FileText,
    title: "Document Synthesis",
    description: "Attach a PDF or DOCX file to extract, analyze, and synthesize its key insights.",
    prompt: "How can I analyze and extract key takeaways from multi-page documents while maintaining high accuracy?",
  },
  {
    icon: Sparkles,
    title: "Reasoning & Logic",
    description: "Walk step-by-step through solving a complex distributed consensus problem.",
    prompt: "Explain how the Raft consensus algorithm handles leader election and log replication step by step.",
  },
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSelectPrompt }) => {
  return (
    <div
      style={{
        maxWidth: "850px",
        margin: "0 auto",
        padding: "48px 24px 24px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
      }}
    >
      {/* Editorial Category Tag */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
        }}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            backgroundColor: "var(--swiss-accent)",
          }}
        />
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--swiss-text-secondary)",
          }}
        >
          Kantha Swiss Intelligence
        </span>
      </div>

      {/* Main Typographic Heading */}
      <h1
        style={{
          fontSize: "36px",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          lineHeight: 1.15,
          color: "var(--swiss-text)",
          margin: "0 0 16px 0",
        }}
      >
        What would you like to explore?
      </h1>

      <p
        style={{
          fontSize: "15px",
          lineHeight: 1.6,
          color: "var(--swiss-text-secondary)",
          margin: "0 0 40px 0",
          maxWidth: "600px",
        }}
      >
        A precision-crafted editorial chat workspace. Real-time streaming tokens,
        transparent reasoning disclosure, and local-first persistence.
      </p>

      {/* Suggestion Prompts Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "12px",
          width: "100%",
        }}
      >
        {PROMPT_SUGGESTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              onClick={() => onSelectPrompt(item.prompt)}
              style={{
                padding: "16px",
                backgroundColor: "var(--swiss-surface)",
                border: "1px solid var(--swiss-border)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "12px",
                transition: "background-color 150ms ease, border-color 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--swiss-hover)";
                e.currentTarget.style.borderColor = "var(--swiss-text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--swiss-surface)";
                e.currentTarget.style.borderColor = "var(--swiss-border)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Icon size={18} style={{ color: "var(--swiss-accent)" }} />
                <ArrowUpRight size={14} style={{ color: "var(--swiss-text-secondary)" }} />
              </div>

              <div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--swiss-text)",
                    marginBottom: "4px",
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    lineHeight: 1.5,
                    color: "var(--swiss-text-secondary)",
                  }}
                >
                  {item.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
