import React from "react";
import { Dialog, Button } from "@astryxdesign/core";

export interface DeleteDialogProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteDialog: React.FC<DeleteDialogProps> = ({
  isOpen,
  title,
  onClose,
  onConfirm,
}) => {
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <div
        style={{
          padding: "24px",
          backgroundColor: "var(--swiss-surface)",
          border: "1px solid var(--swiss-border)",
          minWidth: "360px",
          maxWidth: "440px",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--swiss-accent)",
            marginBottom: "12px",
          }}
        >
          Delete Conversation
        </div>

        <p
          style={{
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--swiss-text)",
            margin: "0 0 24px 0",
          }}
        >
          Are you sure you want to permanently delete{" "}
          <strong>"{title}"</strong>? This will remove all local message history from IndexedDB.
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <Button label="Cancel" variant="ghost" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            label="Delete conversation"
            variant="primary"
            size="sm"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            type="button"
            style={{
              backgroundColor: "var(--swiss-accent)",
              borderColor: "var(--swiss-accent)",
              color: "#FFFFFF",
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
