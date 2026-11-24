import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock, Divider } from "@astryxdesign/core";

export interface SwissMarkdownProps {
  content: string;
}

export const SwissMarkdown: React.FC<SwissMarkdownProps> = ({ content }) => {
  return (
    <div
      style={{
        fontSize: "14px",
        lineHeight: 1.65,
        color: "var(--swiss-text)",
        wordBreak: "break-word",
        fontFamily: "var(--font-sans)",
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }: any) {
            const match = /language-([\w-]+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");

            if (!inline && (match || codeString.includes("\n"))) {
              const language = match ? match[1] : "plaintext";
              return (
                <div style={{ margin: "14px 0", maxWidth: "100%", overflowX: "auto" }}>
                  <CodeBlock
                    code={codeString}
                    language={language}
                    hasCopyButton
                    hasLanguageLabel
                    width="100%"
                  />
                </div>
              );
            }

            return (
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  padding: "1px 5px",
                  backgroundColor: "var(--swiss-hover)",
                  border: "1px solid var(--swiss-border)",
                  borderRadius: "2px",
                  color: "var(--swiss-text)",
                }}
                {...props}
              >
                {children}
              </code>
            );
          },

          h1: ({ children }) => (
            <h1
              style={{
                fontSize: "20px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: "22px 0 10px 0",
                paddingBottom: "8px",
                borderBottom: "1px solid var(--swiss-border)",
                color: "var(--swiss-text)",
              }}
            >
              {children}
            </h1>
          ),

          h2: ({ children }) => (
            <h2
              style={{
                fontSize: "17px",
                fontWeight: 600,
                letterSpacing: "-0.015em",
                margin: "18px 0 8px 0",
                color: "var(--swiss-text)",
              }}
            >
              {children}
            </h2>
          ),

          h3: ({ children }) => (
            <h3
              style={{
                fontSize: "14px",
                fontWeight: 600,
                margin: "14px 0 6px 0",
                color: "var(--swiss-text)",
              }}
            >
              {children}
            </h3>
          ),

          p: ({ children }) => (
            <p style={{ margin: "0 0 12px 0", lineHeight: 1.65 }}>{children}</p>
          ),

          ul: ({ children }) => (
            <ul style={{ margin: "0 0 12px 0", paddingLeft: "20px" }}>{children}</ul>
          ),

          ol: ({ children }) => (
            <ol style={{ margin: "0 0 12px 0", paddingLeft: "20px" }}>{children}</ol>
          ),

          li: ({ children }) => <li style={{ marginBottom: "4px" }}>{children}</li>,

          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "12px 0",
                padding: "10px 14px",
                border: "1px solid var(--swiss-border)",
                backgroundColor: "var(--swiss-surface-muted)",
                color: "var(--swiss-text-secondary)",
                fontStyle: "normal",
              }}
            >
              {children}
            </blockquote>
          ),

          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "14px 0" }}>
              <table
                className="tabular-nums"
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  border: "1px solid var(--swiss-border)",
                  fontSize: "13px",
                }}
              >
                {children}
              </table>
            </div>
          ),

          th: ({ children }) => (
            <th
              style={{
                padding: "8px 12px",
                textAlign: "left",
                backgroundColor: "var(--swiss-hover)",
                borderBottom: "1px solid var(--swiss-border)",
                borderRight: "1px solid var(--swiss-border)",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--swiss-text)",
              }}
            >
              {children}
            </th>
          ),

          td: ({ children }) => (
            <td
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--swiss-border)",
                borderRight: "1px solid var(--swiss-border)",
                color: "var(--swiss-text)",
              }}
            >
              {children}
            </td>
          ),

          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--swiss-accent)",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              {children}
            </a>
          ),

          hr: () => (
            <div style={{ margin: "20px 0" }}>
              <Divider />
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
