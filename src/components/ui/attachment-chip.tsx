"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function AttachmentChip({
  name,
  onRemove,
  size = "sm",
}: {
  name: string;
  onRemove: () => void;
  size?: "sm" | "default";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs",
        size === "sm" && "px-1.5 py-0.5 text-[10px]",
        "bg-muted border-muted-foreground/20"
      )}
    >
      <span className="max-w-[100px] truncate font-mono">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-muted/50"
        aria-label={`Remove ${name}`}
      >
        <svg
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}