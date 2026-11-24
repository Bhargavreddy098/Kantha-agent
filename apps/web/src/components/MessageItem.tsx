import React, { useState } from "react";
import {
  Banner,
  Button,
  ChatMessage,
  ChatMessageBubble,
  Divider,
  HStack,
  Text,
} from "@astryxdesign/core";
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

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ padding: "18px 0 0 0", width: "100%" }}>
      <ChatMessage
        sender={isUser ? "user" : "assistant"}
        name={
          <HStack align="center" gap="8px" style={{ marginBottom: "8px" }}>
            <Text
              size="xs"
              weight="semibold"
              style={{
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: isUser ? "var(--swiss-text)" : "var(--swiss-accent)",
              }}
            >
              {isUser ? "01 / USER" : "02 / KANTHA"}
            </Text>
            <Text
              size="xs"
              hasTabularNumbers
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--swiss-text-secondary)",
              }}
            >
              {formatTime(message.timestamp)}
            </Text>
          </HStack>
        }
      >
        <ChatMessageBubble variant="ghost" width="100%">
          {message.attachments && message.attachments.length > 0 && (
            <HStack gap="8px" style={{ flexWrap: "wrap", marginBottom: "12px" }}>
              {message.attachments.map((att) => (
                <AttachmentChip key={att.id} attachment={att} isReadonly />
              ))}
            </HStack>
          )}

          {!isUser && (message.reasoning || isStreaming) && (
            <ThinkingPanel reasoning={message.reasoning || ""} isStreaming={isStreaming} />
          )}

          {isUser ? (
            <Text
              as="div"
              size="md"
              style={{
                fontSize: "14px",
                lineHeight: 1.65,
                color: "var(--swiss-text)",
                whiteSpace: "pre-wrap",
              }}
            >
              {message.content}
            </Text>
          ) : (
            <div>
              {message.content ? (
                <SwissMarkdown content={message.content} />
              ) : isStreaming ? (
                <Text
                  size="sm"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--swiss-text-secondary)",
                  }}
                >
                  Streaming response...
                </Text>
              ) : message.status === "error" ? (
                <Banner
                  status="error"
                  title="Generation interrupted"
                  description="The request could not complete due to an upstream error or cancellation."
                />
              ) : null}
            </div>
          )}

          <HStack align="center" gap="4px" style={{ marginTop: "10px", marginBottom: "14px" }}>
            <Button
              label={hasCopied ? "Copied" : "Copy"}
              variant="ghost"
              size="sm"
              icon={hasCopied ? <Check size={13} /> : <Copy size={13} />}
              onClick={handleCopy}
            >
              {hasCopied ? "Copied" : "Copy"}
            </Button>

            {!isUser && !isStreaming && onRegenerate && (
              <Button
                label="Regenerate response"
                variant="ghost"
                size="sm"
                icon={<RotateCcw size={13} />}
                onClick={onRegenerate}
              >
                Regenerate
              </Button>
            )}
          </HStack>
        </ChatMessageBubble>
      </ChatMessage>
      <Divider />
    </div>
  );
};
