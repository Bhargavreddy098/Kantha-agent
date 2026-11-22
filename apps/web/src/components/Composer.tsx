import React, { useState, useRef } from "react";
import { ChatComposer, IconButton } from "@astryxdesign/core";
import { Paperclip, Loader2 } from "lucide-react";
import { AttachmentChip } from "./AttachmentChip";
import {
  MAX_FILE_SIZE,
  MAX_ATTACHMENTS,
  ACCEPTED_EXTENSIONS,
  isImageFile,
  readImageAsDataUrl,
  extractDocumentText,
} from "../services/documentService";
import type { StoredAttachment } from "../db/chatDb";

export interface ComposerProps {
  onSubmit: (text: string, attachments: StoredAttachment[]) => void;
  onStop?: () => void;
  isGenerating?: boolean;
  isDisabled?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  onSubmit,
  onStop,
  isGenerating = false,
  isDisabled = false,
}) => {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<StoredAttachment[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | File[]) => {
    setErrorMessage(null);
    const fileArray = Array.from(files);

    if (attachments.length + fileArray.length > MAX_ATTACHMENTS) {
      setErrorMessage(`Maximum ${MAX_ATTACHMENTS} attachments per message.`);
      return;
    }

    setIsProcessingFile(true);

    try {
      const newAttachments: StoredAttachment[] = [];

      for (const file of fileArray) {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(
            `File "${file.name}" exceeds the 10MB limit (${(file.size / (1024 * 1024)).toFixed(
              1
            )}MB).`
          );
        }

        const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        if (isImageFile(file)) {
          const dataUrl = await readImageAsDataUrl(file);
          newAttachments.push({
            id,
            name: file.name,
            type: file.type || "image/png",
            size: file.size,
            dataUrl,
          });
        } else {
          // Document: call server extraction
          const extraction = await extractDocumentText(file);
          newAttachments.push({
            id,
            name: file.name,
            type: file.type || "text/plain",
            size: file.size,
            extractedText: extraction.extractedText,
          });
        }
      }

      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process attached file.");
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = (text: string) => {
    if (!text.trim() && attachments.length === 0) return;
    if (isProcessingFile) return;

    onSubmit(text.trim(), attachments);
    setValue("");
    setAttachments([]);
    setErrorMessage(null);
  };

  const drawerContent =
    attachments.length > 0 || isProcessingFile ? (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          padding: "8px 12px",
          backgroundColor: "var(--swiss-bg)",
          borderBottom: "1px solid var(--swiss-border)",
        }}
      >
        {attachments.map((att) => (
          <AttachmentChip
            key={att.id}
            attachment={att}
            onRemove={() => handleRemoveAttachment(att.id)}
          />
        ))}

        {isProcessingFile && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              fontSize: "12px",
              color: "var(--swiss-text-secondary)",
            }}
          >
            <Loader2 size={14} className="animate-spin" />
            <span>Extracting document text...</span>
          </div>
        )}
      </div>
    ) : undefined;

  const footerActionsContent = (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(",")}
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
        }}
      />
      <IconButton
        icon={<Paperclip size={16} />}
        label="Attach files or documents"
        variant="ghost"
        size="md"
        isDisabled={isDisabled || isGenerating || isProcessingFile}
        onClick={() => fileInputRef.current?.click()}
      />
    </div>
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "850px",
        margin: "0 auto",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files) {
          handleFiles(e.dataTransfer.files);
        }
      }}
    >
      {isDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            backgroundColor: "rgba(248, 248, 246, 0.9)",
            border: "2px dashed var(--swiss-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--swiss-accent)",
            pointerEvents: "none",
          }}
        >
          Drop files to attach
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            marginBottom: "8px",
            padding: "6px 12px",
            backgroundColor: "#FEE2E2",
            borderLeft: "2px solid var(--swiss-accent)",
            fontSize: "12px",
            color: "#991B1B",
          }}
        >
          {errorMessage}
        </div>
      )}

      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        onStop={onStop}
        isStopShown={isGenerating}
        isDisabled={isDisabled || isProcessingFile}
        placeholder="Type a message, or drag and drop images and documents..."
        elevation="none"
        density="balanced"
        drawer={drawerContent}
        footerActions={footerActionsContent}
        style={{
          border: "1px solid var(--swiss-border)",
          backgroundColor: "var(--swiss-surface)",
          borderRadius: "0px",
        }}
      />
    </div>
  );
};
