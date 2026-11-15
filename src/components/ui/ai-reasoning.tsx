"use client";

import React, { useState } from "react";
import { BrainCircuit, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReasoningProps {
  content: string;
  isStreaming?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

export function Reasoning({
  content,
  isStreaming = false,
  defaultExpanded = true,
  className,
}: ReasoningProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Auto-collapse when done streaming if content is lengthy, but let user toggle
  const charCount = content.length;

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/50 overflow-hidden transition-all text-xs",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300 font-medium">
          <BrainCircuit className={cn("size-3.5 text-blue-600", isStreaming && "animate-pulse")} />
          <span>Thought process</span>
          {isStreaming ? (
            <span className="flex items-center gap-1 text-[10px] text-blue-600 font-mono bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200/60">
              <span className="size-1.5 rounded-full bg-blue-600 animate-ping" />
              Thinking...
            </span>
          ) : (
            <span className="text-[10px] text-neutral-400 font-mono">
              ({charCount} chars)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-neutral-400">
          <span className="text-[10px]">{isExpanded ? "Collapse" : "Expand"}</span>
          {isExpanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3.5 pb-3 pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50 font-mono text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap max-h-60 overflow-y-auto">
          {content && (content.includes("•") || content.includes("\n- ") || content.includes("\n* ")) ? (
            <div className="space-y-1.5">
              {content
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="size-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <span className="leading-snug">{step.replace(/^[•\-\*]\s*/, "")}</span>
                  </div>
                ))}
            </div>
          ) : (
            content || "Analyzing context and planning next steps..."
          )}
        </div>
      )}
    </div>
  );
}

export function ChainOfThought({
  steps,
  currentStep,
}: {
  steps: string[];
  currentStep?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-neutral-200 bg-white dark:bg-neutral-900">
      <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
        <Sparkles className="size-3 text-amber-500" />
        <span>Chain of Thought</span>
      </div>
      <div className="space-y-1">
        {steps.map((step, idx) => {
          const isDone = currentStep !== undefined && idx < currentStep;
          const isCurrent = currentStep !== undefined && idx === currentStep;

          return (
            <div
              key={idx}
              className={cn(
                "flex items-center gap-2 text-xs py-1 px-2 rounded-lg transition-colors",
                isCurrent && "bg-blue-50 dark:bg-blue-950 text-blue-700 font-medium",
                isDone && "text-neutral-500 line-through",
                !isDone && !isCurrent && "text-neutral-600"
              )}
            >
              <span className="size-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
              <span>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
