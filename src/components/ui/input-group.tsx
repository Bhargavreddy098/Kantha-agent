"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Input Group root
export function InputGroup({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// Input Group Textarea
export function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex-1 resize-none border-0 bg-transparent p-3 text-sm placeholder:text-muted-foreground focus:outline-none",
        className
      )}
      {...props}
    />
  );
}

// Input Group Addon
export function InputGroupAddon({
  align = "block-start",
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { align?: "block-start" | "block-end" }) {
  return (
    <div
      className={cn(
        "flex items-center",
        align === "block-start" && "flex-col",
        align === "block-end" && "flex-row justify-end",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Input Group Button
export function InputGroupButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<"button"> & {
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const buttonVariants = {
    default: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "destructive-destructive hover:destructive-destructive/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
  };

  const buttonSizes = {
    default: "h-10 px-4 py-2",
    sm: "h-8 px-3 text-xs",
    lg: "h-10 px-8 py-2",
    icon: "h-8 w-8",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:opacity-50 disabled:pointer-events-none",
        buttonVariants[variant],
        buttonSizes[size],
        size === "icon" && "p-0",
        className
      )}
      {...props}
    />
  );
}
