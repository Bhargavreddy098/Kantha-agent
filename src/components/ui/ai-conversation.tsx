"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  isStreaming?: boolean;
}

export function Conversation({
  children,
  className,
  isStreaming = false,
  ...props
}: ConversationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // If user is more than 120px away from the bottom, unlock scroll
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 120;
    setUserScrolledUp(!isAtBottom);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    endRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    setUserScrolledUp(false);
  }, []);

  // Auto-scroll when new content streams in, unless the user intentionally scrolled up
  useEffect(() => {
    if (!userScrolledUp) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [children, isStreaming, userScrolledUp]);

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          "flex-1 overflow-y-auto px-4 md:px-8 py-6 scroll-smooth",
          className
        )}
        {...props}
      >
        <div className="max-w-3xl mx-auto w-full space-y-6">
          {children}
          <div ref={endRef} className="h-4" />
        </div>
      </div>

      {/* Floating Jump to Bottom Button */}
      {userScrolledUp && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-5 right-8 z-20 flex items-center gap-1.5 rounded-full bg-white/95 border border-neutral-300 dark:border-neutral-700 px-3.5 py-1.5 text-xs font-medium text-neutral-800 dark:text-neutral-200 shadow-md hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all cursor-pointer backdrop-blur-xs"
        >
          <ArrowDown className="size-3.5 text-blue-600 animate-bounce" />
          <span>Latest output</span>
        </button>
      )}
    </div>
  );
}

export function ConversationContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-5 w-full", className)}>
      {children}
    </div>
  );
}
