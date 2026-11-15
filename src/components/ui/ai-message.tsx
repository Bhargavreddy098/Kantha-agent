"use client";

import React, { useMemo } from "react";
import { Avatar } from "@astryxdesign/core/Avatar";
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockContent,
} from "@/components/ui/code-block";
import { cn } from "@/lib/utils";

interface MessageProps {
  role: "user" | "assistant" | "system";
  avatarName?: string;
  timestamp?: string;
  children: React.ReactNode;
  className?: string;
}

export function Message({
  role,
  avatarName,
  timestamp,
  children,
  className,
}: MessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 w-full group",
        isUser ? "flex-row-reverse" : "flex-row",
        className
      )}
    >
      <div className="shrink-0 mt-0.5">
        <Avatar
          name={avatarName || (isUser ? "You" : "AI")}
          size="sm"
        />
      </div>

      <div
        className={cn(
          "flex flex-col gap-1 max-w-[85%] md:max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div className="flex items-center gap-2 px-1 text-[11px] text-neutral-400 font-mono">
          <span className="font-semibold text-neutral-700 dark:text-neutral-300">
            {avatarName || (isUser ? "You" : "AI Assistant")}
          </span>
          {timestamp && <span>{timestamp}</span>}
        </div>

        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed transition-all",
            isUser
              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-200/90 dark:border-neutral-700 shadow-2xs rounded-tr-sm"
              : "bg-transparent text-neutral-900 dark:text-neutral-100 p-0"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface MessageResponseProps {
  children: string;
  className?: string;
}

/**
 * MessageResponse renders formatted streaming text and fenced markdown codeblocks cleanly.
 */
export function MessageResponse({ children, className }: MessageResponseProps) {
  const parts = useMemo(() => {
    const text = children || "";
    const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const result: Array<{ type: "text" | "code"; lang?: string; content: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      result.push({
        type: "code",
        lang: match[1] || "code",
        content: match[2].trimEnd(),
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      result.push({ type: "text", content: text.slice(lastIndex) });
    }

    return result;
  }, [children]);

  return (
    <div className={cn("space-y-3 font-sans text-sm leading-relaxed text-neutral-900 dark:text-neutral-100", className)}>
      {parts.map((p, idx) => {
        if (p.type === "code") {
          return (
            <div key={idx} className="my-2.5 not-prose">
              <CodeBlock size="sm">
                <CodeBlockHeader>
                  <CodeBlockTitle>{p.lang || "code"}</CodeBlockTitle>
                  <CodeBlockActions>
                    <CodeBlockCopyButton value={p.content} />
                  </CodeBlockActions>
                </CodeBlockHeader>
                <CodeBlockContent wrap>
                  {p.content}
                </CodeBlockContent>
              </CodeBlock>
            </div>
          );
        }

        return (
          <div key={idx} className="whitespace-pre-wrap font-sans">
            {p.content}
          </div>
        );
      })}
    </div>
  );
}
