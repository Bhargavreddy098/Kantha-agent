import React from "react";
import { FileText, Image as ImageIcon, X } from "lucide-react";
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
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 8px",
        backgroundColor: "var(--swiss-surface)",
        border: "1px solid var(--swiss-border)",
        fontSize: "12px",
        color: "var(--swiss-text)",
        maxWidth: "240px",
      }}
    >
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
        <FileText size={16} style={{ color: "var(--swiss-text-secondary)", flexShrink: 0 }} />
      )}

      <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}
          title={attachment.name}
        >
          {attachment.name}
        </span>
        <span style={{ fontSize: "10px", color: "var(--swiss-text-secondary)" }}>
          {formatSize(attachment.size)}
        </span>
      </div>

      {!isReadonly && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove attachment"
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: "2px",
            color: "var(--swiss-text-secondary)",
            display: "flex",
            alignItems: "center",
            marginLeft: "4px",
          }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};
