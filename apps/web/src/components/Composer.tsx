import React, { useState, useRef } from "react";
import {
  Banner,
  Button,
  ChatComposer,
  Divider,
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  HStack,
  IconButton,
  Text,
  TextInput,
} from "@astryxdesign/core";
import { Paperclip, Loader2, Cpu, ChevronDown, Check, Search } from "lucide-react";
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
import type { ProvidersDataResponse } from "../services/providerService";

export interface ComposerProps {
  onSubmit: (text: string, attachments: StoredAttachment[]) => void;
  onStop?: () => void;
  isGenerating?: boolean;
  isDisabled?: boolean;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  providersData: ProvidersDataResponse | null;
  onOpenSettings?: () => void;
  placeholder?: string;
  hideAttachments?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  onSubmit,
  onStop,
  isGenerating = false,
  isDisabled = false,
  selectedModel,
  onSelectModel,
  providersData,
  onOpenSettings,
  placeholder = "Type a prompt, or drag and drop images and documents...",
  hideAttachments = false,
}) => {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<StoredAttachment[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Put configured providers (like OpenRouter) first so free models are front and center
  const providersList = [...(providersData?.providers || [])].sort((a, b) => {
    if (a.id === "openrouter" && a.configured) return -1;
    if (b.id === "openrouter" && b.configured) return 1;
    if (a.configured && !b.configured) return -1;
    if (!a.configured && b.configured) return 1;
    return 0;
  });

  const allModels = providersList.flatMap((p) =>
    p.models.map((m) => ({
      ...m,
      providerId: p.id,
      providerName: p.name,
      fullId: `${p.id}:${m.id}`,
    }))
  );

  const currentModelObj = allModels.find(
    (m) => m.fullId === selectedModel || m.id === selectedModel
  );

  const activeModelDisplayName = (() => {
    if (currentModelObj) return currentModelObj.name;
    for (const p of providersList) {
      if (selectedModel.startsWith(`${p.id}:`)) {
        return selectedModel.slice(p.id.length + 1);
      }
    }
    return selectedModel || "openrouter/free";
  })();

  const handleFiles = async (files: FileList | File[]) => {
    if (hideAttachments) return;
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
    !hideAttachments && (attachments.length > 0 || isProcessingFile) ? (
      <HStack
        gap="8px"
        style={{
          flexWrap: "wrap",
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
          <HStack align="center" gap="6px" style={{ padding: "4px 8px" }}>
            <Loader2 size={14} className="animate-spin" />
            <Text size="xs" style={{ color: "var(--swiss-text-secondary)" }}>
              Extracting document text...
            </Text>
          </HStack>
        )}
      </HStack>
    ) : undefined;

  const query = searchQuery.trim().toLowerCase();
  const filteredProviders = providersList
    .map((provider) => {
      const matchingModels = provider.models.filter(
        (m) =>
          !query ||
          m.name.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query) ||
          provider.name.toLowerCase().includes(query)
      );
      return {
        ...provider,
        models: matchingModels,
      };
    })
    .filter((p) => p.models.length > 0);

  const footerActionsContent = (
    <HStack align="center" gap="8px">
      {providersList.length > 0 && (
        <DropdownMenu
          renderTrigger={(triggerProps) => (
            <Button
              {...triggerProps}
              label={`Select model: ${activeModelDisplayName}`}
              variant="secondary"
              size="sm"
              icon={<Cpu size={13} style={{ color: "var(--swiss-accent)" }} />}
              endContent={<ChevronDown size={12} />}
            >
              <span
                style={{
                  maxWidth: "200px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                }}
              >
                {activeModelDisplayName}
              </span>
            </Button>
          )}
        >
          {allModels.length > 5 && (
            <div
              style={{
                padding: "6px 8px",
                borderBottom: "1px solid var(--swiss-border)",
                marginBottom: "4px",
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <TextInput
                label="Search models"
                isLabelHidden
                size="sm"
                placeholder="Filter models..."
                value={searchQuery}
                onChange={setSearchQuery}
                startIcon={<Search size={12} />}
                hasClear
              />
            </div>
          )}

          {query && filteredProviders.length === 0 && (
            <div style={{ padding: "8px 12px" }}>
              <Text size="xs" style={{ color: "var(--swiss-text-secondary)" }}>
                No models match &quot;{searchQuery}&quot;
              </Text>
            </div>
          )}

          {filteredProviders.map((provider) => (
            <DropdownMenuGroup
              key={provider.id}
              title={`${provider.name}${provider.configured ? "" : " (Unconfigured)"}`}
            >
              {provider.models.map((m) => {
                const fullId = `${provider.id}:${m.id}`;
                const isSelected =
                  selectedModel === fullId ||
                  (selectedModel === m.id &&
                    !providersList.some((p) => selectedModel.startsWith(`${p.id}:`)));
                return (
                  <DropdownMenuItem
                    key={fullId}
                    label={m.name === m.id ? m.name : `${m.name} (${m.id})`}
                    icon={isSelected ? <Check size={14} color="var(--swiss-accent)" /> : undefined}
                    onClick={() => {
                      onSelectModel(fullId);
                      setSearchQuery("");
                    }}
                  />
                );
              })}
            </DropdownMenuGroup>
          ))}

          {onOpenSettings && (
            <DropdownMenuGroup title="Configuration">
              <DropdownMenuItem label="Configure Providers..." onClick={onOpenSettings} />
            </DropdownMenuGroup>
          )}
        </DropdownMenu>
      )}

      {!hideAttachments && (
        <>
          <Divider orientation="vertical" style={{ height: "16px" }} />
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
            icon={<Paperclip size={15} />}
            label="Attach files or documents"
            variant="ghost"
            size="sm"
            isDisabled={isDisabled || isGenerating || isProcessingFile}
            onClick={() => fileInputRef.current?.click()}
          />
        </>
      )}
    </HStack>
  );

  return (
    <div
      className="swiss-composer-frame"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "880px",
        margin: "0 auto",
      }}
      onDragOver={(e) => {
        if (hideAttachments) return;
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (hideAttachments) return;
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        if (hideAttachments) return;
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
            backgroundColor: "rgba(247, 247, 245, 0.92)",
            border: "1px dashed var(--swiss-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Text
            size="xs"
            weight="semibold"
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--swiss-accent)",
            }}
          >
            DROP FILES TO ATTACH
          </Text>
        </div>
      )}

      {errorMessage && (
        <div style={{ padding: "8px 10px 0 10px" }}>
          <Banner
            status="error"
            title="Attachment error"
            description={errorMessage}
            isDismissable
            onDismiss={() => setErrorMessage(null)}
          />
        </div>
      )}

      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        onStop={onStop}
        isStopShown={isGenerating}
        isDisabled={isDisabled || isProcessingFile}
        placeholder={placeholder}
        elevation="none"
        density="balanced"
        drawer={drawerContent}
        footerActions={footerActionsContent}
        style={{
          border: "none",
          backgroundColor: "transparent",
          borderRadius: "4px",
        }}
      />
    </div>
  );
};
