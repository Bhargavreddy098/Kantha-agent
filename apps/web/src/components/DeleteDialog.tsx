import React from "react";
import { Button, Dialog, Heading, HStack, Text, VStack } from "@astryxdesign/core";

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
      <VStack
        gap="16px"
        style={{
          padding: "24px",
          backgroundColor: "var(--swiss-surface)",
          border: "1px solid var(--swiss-border)",
          minWidth: "360px",
          maxWidth: "440px",
        }}
      >
        <Heading level={3} style={{ margin: 0, fontSize: "15px", color: "var(--swiss-accent)" }}>
          Delete Thread
        </Heading>

        <Text size="sm" style={{ lineHeight: 1.6, color: "var(--swiss-text)" }}>
          Permanently delete &ldquo;{title}&rdquo;? All local messages in this thread will be
          removed from IndexedDB.
        </Text>

        <HStack justify="end" gap="8px">
          <Button label="Cancel" variant="ghost" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            label="Delete thread"
            variant="destructive"
            size="sm"
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Delete
          </Button>
        </HStack>
      </VStack>
    </Dialog>
  );
};
