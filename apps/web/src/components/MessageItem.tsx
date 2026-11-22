import React, { useState } from "react";
import { ChatMessage, ChatMessageBubble } from "@astryxdesign/core";
import { Copy, Check, RotateCcw } from "lucide-react";
import { ThinkingPanel } from "./ThinkingPanel";
import { SwissMarkdown } from "./SwissMarkdown";
import { AttachmentChip } from "./AttachmentChip";
import type { StoredMessage } from "../db/chatDb";

export interface MessageItemProps {
  message: StoredMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isStreaming = false,
  onRegenerate,
}) => {
  const [hasCopied, setHasCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div
      style={{
        padding: "16px 0",
        borderBottom: "1px solid var(--swiss-border)",
        width: "100%",
      }}
    >
      <ChatMessage
        sender={isUser ? "user" : "assistant"}
        name={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                backgroundColor: isUser ? "var(--swiss-text)" : "var(--swiss-accent)",
              }}
            />
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--swiss-text)",
              }}
            >
              {isUser ? "You" : "Kantha Intelligence"}
            </span>
            <span
              style={{
                fontSize: "11px",
                color: "var(--swiss-text-secondary)",
                marginLeft: "4px",
              }}
            >
              {formatTime(message.timestamp)}
            </span>
          </div>
        }
      >
        <ChatMessageBubble variant="ghost" width="100%">
          {/* User Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              {message.attachments.map((att) => (
                <AttachmentChip key={att.id} attachment={att} isReadonly />
              ))}
            </div>
          )}

          {/* Assistant Thinking Panel */}
          {!isUser && (message.reasoning || isStreaming) && (
            <ThinkingPanel reasoning={message.reasoning || ""} isStreaming={isStreaming} />
          )}

          {/* Message Content */}
          {isUser ? (
            <div
              style={{
                fontSize: "14px",
                lineHeight: 1.6,
                color: "var(--swiss-text)",
                whiteSpace: "pre-wrap",
              }}
            >
              {message.content}
            </div>
          ) : (
            <div>
              {message.content ? (
                <SwissMarkdown content={message.content} />
              ) : isStreaming ? (
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--swiss-text-secondary)",
                    fontStyle: "italic",
                  }}
                >
                  Generating response...
                </div>
              ) : message.status === "error" ? (
                <div
                  style={{
                    padding: "8px 12px",
                    backgroundColor: "#FEE2E2",
                    borderLeft: "2px solid var(--swiss-accent)",
                    color: "#991B1B",
                    fontSize: "13px",
                  }}
                >
                  Generation was interrupted or encountered a network error.
                </div>
              ) : null}
            </div>
          )}

          {/* Message Actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "12px",
              opacity: 0.8,
            }}
          >
            <button
              type="button"
              onClick={handleCopy}
              title="Copy message"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: "11px",
                color: "var(--swiss-text-secondary)",
              }}
            >
              {hasCopied ? <Check size={12} color="var(--swiss-accent)" /> : <Copy size={12} />}
              <span>{hasCopied ? "Copied" : "Copy"}</span>
            </button>

            {!isUser && !isStreaming && onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                title="Regenerate response"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  padding: "2px 6px",
                  fontSize: "11px",
                  color: "var(--swiss-text-secondary)",
                }}
              >
                <RotateCcw size={12} />
                <span>Regenerate</span>
              </button>
            )}
          </div>
        </ChatMessageBubble>
      </ChatMessage>
    </div>
  );
};
