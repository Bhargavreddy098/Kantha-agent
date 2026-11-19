"use client";

import * as React from "react";
import { useState } from "react";
import { Copy, Check, FileText, RotateCcw } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { StoredMessage } from "@/types/chat";
import { cn } from "@/lib/utils";

export interface MessageItemProps {
  message: StoredMessage;
  isStreaming?: boolean;
  onRetry?: () => void;
}

export function MessageItem({
  message,
  isStreaming,
  onRetry,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  if (isUser) {
    return (
      <div className="flex w-full justify-end py-2">
        <div className="flex max-w-[85%] sm:max-w-[75%] flex-col items-end">
          {/* User Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5 justify-end">
              {message.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 rounded-[10px] border border-[#0000001a] bg-[#f9f9f9] px-2.5 py-1 text-[12px] text-[#5d5d5d]"
                >
                  <FileText className="h-3.5 w-3.5 text-[#8f8f8f]" />
                  <span className="truncate max-w-[140px]">{att.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* User Message Bubble: 10px radius, Sidebar Mist (#f9f9f9) background, Graphite Ink (#0d0d0d) text */}
          <div className="rounded-[10px] bg-[#f9f9f9] border border-[#0000001a] px-4 py-2.5 text-workspace text-[#0d0d0d] whitespace-pre-wrap break-words">
            {message.text}
          </div>
        </div>
      </div>
    );
  }

  // Assistant Message Turn
  return (
    <div className="flex w-full gap-3 py-3 text-left">
      {/* Minimal Avatar Circle: Graphite Ink fill, white 'K' mark */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#0d0d0d] text-[13px] font-semibold text-[#ffffff] mt-0.5">
        K
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* If streaming and response text hasn't arrived yet, show ThinkingOrb */}
        {isStreaming && !message.text.trim() ? (
          <div className="py-2 flex items-center">
            <ThinkingOrb state="searching" size={64} />
          </div>
        ) : message.text.trim() ? (
          <div className="prose prose-neutral max-w-none text-workspace text-[#0d0d0d] break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                // Achromatic Code Block: 10px radius, 1px Hairline border (#0000001a)
                pre({ children }) {
                  return (
                    <div className="relative my-3 rounded-[10px] border border-[#0000001a] bg-[#0d0d0d] text-[#e6e6e6] overflow-hidden">
                      {children}
                    </div>
                  );
                },
                code({ className, children, ...props }) {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code
                        className="rounded bg-[#0000000d] px-1.5 py-0.5 text-workspace-control font-workspace-mono text-[#0d0d0d]"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code className={cn("text-workspace-control font-workspace-mono", className)} {...props}>
                      {children}
                    </code>
                  );
                },
                table({ children }) {
                  return (
                    <div className="my-3 overflow-x-auto rounded-[10px] border border-[#0000001a]">
                      <table className="w-full border-collapse text-[14px]">
                        {children}
                      </table>
                    </div>
                  );
                },
                th({ children }) {
                  return (
                    <th className="border-b border-[#0000001a] bg-[#f9f9f9] px-3 py-2 text-left text-[13px] font-semibold text-[#0d0d0d]">
                      {children}
                    </th>
                  );
                },
                td({ children }) {
                  return (
                    <td className="border-b border-[#0000001a] px-3 py-2 text-[#5d5d5d]">
                      {children}
                    </td>
                  );
                },
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-[#0d0d0d] hover:text-[#5d5d5d]"
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {message.text}
            </ReactMarkdown>

            {/* Streaming Caret */}
            {isStreaming && (
              <span className="kantha-caret inline-block" aria-hidden="true" />
            )}
          </div>
        ) : null}

        {/* Error Notification */}
        {message.status === "failed" && (
          <div className="mt-2 rounded-[10px] border border-[#0000001a] bg-[#f9f9f9] p-3 text-[13px] text-[#5d5d5d]">
            <p className="font-medium text-[#0d0d0d] mb-0.5">Response error</p>
            <p className="break-words">{message.error || "The provider could not complete the response. Please check your provider connection in Settings."}</p>
          </div>
        )}

        {/* Action Toolbar under Assistant Turn (Compact Icon Buttons) */}
        {!isStreaming && (
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={handleCopy}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#5d5d5d] hover:bg-[#0000000d] hover:text-[#0d0d0d] transition-colors focus:outline-none"
              title="Copy response"
            >
              {copied ? (
                <Check className="h-4 w-4 text-[#0d0d0d] stroke-[2]" />
              ) : (
                <Copy className="h-4 w-4 stroke-[1.8]" />
              )}
            </button>

            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#5d5d5d] hover:bg-[#0000000d] hover:text-[#0d0d0d] transition-colors focus:outline-none"
                title="Retry response"
              >
                <RotateCcw className="h-4 w-4 stroke-[1.8]" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
