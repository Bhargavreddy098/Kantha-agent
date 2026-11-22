import React, { useState, useRef } from "react";
import {
  ChatComposer,
  IconButton,
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@astryxdesign/core";
import { Paperclip, Loader2, Cpu, ChevronDown, Check } from "lucide-react";
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
import type { ProvidersResponse } from "./SettingsDialog";

export interface ComposerProps {
  onSubmit: (text: string, attachments: StoredAttachment[]) => void;
  onStop?: () => void;
  isGenerating?: boolean;
  isDisabled?: boolean;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  providersData: ProvidersResponse | null;
}

export const Composer: React.FC<ComposerProps> = ({
  onSubmit,
  onStop,
  isGenerating = false,
  isDisabled = false,
  selectedModel,
  onSelectModel,
  providersData,
}) => {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<StoredAttachment[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Compute active model display name
  const allModels =
    providersData?.providers?.flatMap((p) =>
      p.models.map((m) => ({
        ...m,
        providerId: p.id,
        providerName: p.name,
        fullId: `${p.id}:${m.id}`,
      }))
    ) || [];

  const currentModelObj = allModels.find(
    (m) => m.fullId === selectedModel || m.id === selectedModel
  );

  const activeModelDisplayName = currentModelObj
    ? currentModelObj.name
    : selectedModel
    ? selectedModel.split(":").pop()
    : "GPT-4o";

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
          borderTopLeftRadius: "12px",
          borderTopRightRadius: "12px",
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
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {/* Astryx DropdownMenu Model Selector */}
      {providersData?.providers && providersData.providers.length > 0 && (
        <DropdownMenu
          renderTrigger={(triggerProps) => (
            <button
              type="button"
              className="swiss-model-pill"
              title="Select AI Model"
              {...triggerProps}
            >
              <Cpu size={13} style={{ color: "var(--swiss-accent)" }} />
              <span style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeModelDisplayName}
              </span>
              <ChevronDown size={12} style={{ opacity: 0.6 }} />
            </button>
          )}
        >
          {providersData.providers.map((provider) => (
            <DropdownMenuGroup key={provider.id} title={provider.name}>
              {provider.models.map((m) => {
                const fullId = `${provider.id}:${m.id}`;
                const isSelected = selectedModel === fullId || selectedModel === m.id;
                return (
                  <DropdownMenuItem
                    key={fullId}
                    label={m.name}
                    icon={isSelected ? <Check size={14} color="var(--swiss-accent)" /> : undefined}
                    onClick={() => onSelectModel(fullId)}
                  />
                );
              })}
            </DropdownMenuGroup>
          ))}
        </DropdownMenu>
      )}

      <div style={{ width: "1px", height: "16px", backgroundColor: "var(--swiss-border)" }} />

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
      className="swiss-floating-composer"
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
            borderRadius: "12px",
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
            margin: "8px 12px",
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
          border: "none",
          backgroundColor: "transparent",
          borderRadius: "12px",
        }}
      />
    </div>
  );
};
