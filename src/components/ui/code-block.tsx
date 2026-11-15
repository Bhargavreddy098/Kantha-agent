"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CodeBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "default" | "sm";
}

export function CodeBlock({
  className,
  size = "default",
  children,
  ...props
}: CodeBlockProps) {
  return (
    <div
      className={cn(
        "my-2 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 overflow-hidden shadow-xs text-xs font-mono",
        size === "sm" && "text-[11px]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CodeBlockHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-neutral-800/80 bg-neutral-900/90 px-3.5 py-1.5 text-xs text-neutral-400 select-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CodeBlockTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "font-semibold text-neutral-300 uppercase tracking-wider text-[11px]",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function CodeBlockActions({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-1.5", className)} {...props}>
      {children}
    </div>
  );
}

export function CodeBlockCopyButton({
  value,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-sans text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 transition-colors cursor-pointer",
        className
      )}
      aria-label="Copy code to clipboard"
      {...props}
    >
      {copied ? (
        <>
          <Check className="size-3 text-emerald-400" />
          <span className="text-emerald-400 font-medium">Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

export function CodeBlockContent({
  className,
  wrap = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLPreElement> & {
  wrap?: boolean;
}) {
  return (
    <pre
      dir="ltr"
      className={cn(
        "p-3.5 leading-relaxed overflow-x-auto text-neutral-200",
        wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
        className
      )}
      {...props}
    >
      <code>{children}</code>
    </pre>
  );
}
