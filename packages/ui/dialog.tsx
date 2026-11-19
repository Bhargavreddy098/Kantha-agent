"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

export function useDialog() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a Dialog");
  }
  return context;
}

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Scrim: Deep Charcoal (#00000080) at 50% opacity, single-layer, no blur */}
        <div
          className="fixed inset-0 bg-[#00000080] transition-opacity"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
        <div className="relative z-10 w-full max-w-5xl">{children}</div>
      </div>
    </DialogContext.Provider>
  );
}

export interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  showCloseButton?: boolean;
  onOpenAutoFocus?: () => void;
  onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
  children: React.ReactNode;
}

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: DialogContentProps) {
  const { onOpenChange } = useDialog();

  const onOpenRef = React.useRef(onOpenAutoFocus);
  onOpenRef.current = onOpenAutoFocus;
  const onCloseRef = React.useRef(onCloseAutoFocus);
  onCloseRef.current = onCloseAutoFocus;

  React.useEffect(() => {
    onOpenRef.current?.();
    return () => {
      onCloseRef.current?.({ preventDefault: () => {} });
    };
  }, []);

  return (
    /* Surface: Pure White (#ffffff), 10px radius, 1px Hairline (#0000001a) border. Flat, no shadow */
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        "relative w-full rounded-[10px] border border-[#0000001a] bg-[#ffffff] text-[#0d0d0d] p-6 focus:outline-none",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-[10px] p-2 text-[#5d5d5d] hover:bg-[#0000000d] hover:text-[#0d0d0d] transition-colors focus:outline-none"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function DialogHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col space-y-1.5 pb-4", className)}>
      {children}
    </div>
  );
}

export function DialogTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      className={cn(
        "text-[20px] font-semibold leading-snug text-[#0d0d0d]",
        className
      )}
    >
      {children}
    </h2>
  );
}

export function DialogDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={cn("text-[14px] leading-[1.43] text-[#5d5d5d]", className)}>
      {children}
    </p>
  );
}

export function DialogClose({
  asChild,
  className,
  children,
}: {
  asChild?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { onOpenChange } = useDialog();

  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as { onClick?: (e: React.MouseEvent) => void };
    return React.cloneElement(children, {
      onClick: (e: React.MouseEvent) => {
        childProps.onClick?.(e);
        onOpenChange(false);
      },
    } as React.Attributes);
  }

  return (
    <button
      type="button"
      onClick={() => onOpenChange(false)}
      className={className}
    >
      {children}
    </button>
  );
}
