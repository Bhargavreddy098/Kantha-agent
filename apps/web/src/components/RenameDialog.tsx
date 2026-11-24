import React, { useState, useEffect } from "react";
import { Button, Dialog, Heading, HStack, TextInput, VStack } from "@astryxdesign/core";

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
        <VStack gap="16px">
          <Heading level={3} style={{ margin: 0, fontSize: "15px" }}>
            Rename Thread
          </Heading>

          <TextInput
            label="Thread title"
            value={title}
            onChange={setTitle}
            hasAutoFocus
            width="100%"
          />

          <HStack justify="end" gap="8px">
            <Button label="Cancel" variant="ghost" size="sm" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button
              label="Save title"
              variant="primary"
              size="sm"
              type="submit"
              isDisabled={!title.trim()}
            >
              Save
            </Button>
          </HStack>
        </VStack>
      </form>
    </Dialog>
  );
};
