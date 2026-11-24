import React from "react";
import { Card, HStack, IconButton, Text, VStack } from "@astryxdesign/core";
import { FileText, X } from "lucide-react";
import type { StoredAttachment } from "../db/chatDb";

export interface AttachmentChipProps {
  attachment: StoredAttachment;
  onRemove?: () => void;
  isReadonly?: boolean;
}

export const AttachmentChip: React.FC<AttachmentChipProps> = ({
  attachment,
  onRemove,
  isReadonly = false,
}) => {
  const isImage = Boolean(attachment.dataUrl);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card
      variant="default"
      padding={4}
      style={{
        display: "inline-flex",
        border: "1px solid var(--swiss-border)",
        borderRadius: "2px",
        maxWidth: "240px",
      }}
    >
      <HStack align="center" gap="8px">
        {isImage ? (
          <img
            src={attachment.dataUrl}
            alt={attachment.name}
            style={{
              width: "24px",
              height: "24px",
              objectFit: "cover",
              border: "1px solid var(--swiss-border)",
              flexShrink: 0,
            }}
          />
        ) : (
          <FileText size={15} style={{ color: "var(--swiss-text-secondary)", flexShrink: 0 }} />
        )}

        <VStack style={{ overflow: "hidden" }}>
          <Text size="xs" weight="medium" maxLines={1}>
            {attachment.name}
          </Text>
          <Text
            size="xs"
            hasTabularNumbers
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--swiss-text-secondary)",
            }}
          >
            {formatSize(attachment.size)}
          </Text>
        </VStack>

        {!isReadonly && onRemove && (
          <IconButton
            icon={<X size={12} />}
            label={`Remove ${attachment.name}`}
            variant="ghost"
            size="sm"
            onClick={onRemove}
          />
        )}
      </HStack>
    </Card>
  );
};
