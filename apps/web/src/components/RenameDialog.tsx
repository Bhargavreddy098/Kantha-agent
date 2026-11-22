import React, { useState, useEffect } from "react";
import { Dialog, Button } from "@astryxdesign/core";

export interface RenameDialogProps {
  isOpen: boolean;
  initialTitle: string;
  onClose: () => void;
  onRename: (newTitle: string) => void;
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
  isOpen,
  initialTitle,
  onClose,
  onRename,
}) => {
  const [title, setTitle] = useState(initialTitle);

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onRename(title.trim());
      onClose();
    }
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <form
        onSubmit={handleSubmit}
        style={{
          padding: "24px",
          backgroundColor: "var(--swiss-surface)",
          border: "1px solid var(--swiss-border)",
          minWidth: "360px",
          maxWidth: "480px",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--swiss-text-secondary)",
            marginBottom: "16px",
          }}
        >
          Rename Conversation
        </div>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: "14px",
            fontFamily: "inherit",
            backgroundColor: "var(--swiss-bg)",
            color: "var(--swiss-text)",
            border: "1px solid var(--swiss-border)",
            outline: "none",
            marginBottom: "24px",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <Button label="Cancel" variant="ghost" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button label="Save" variant="primary" size="sm" type="submit" isDisabled={!title.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
