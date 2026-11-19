"use client";

import { fetchUploadLimits, processFile } from "@/lib/chat/attachments";
import type { ChatAttachment, SendMessageStatus, ChatModelCatalog } from "@/types/chat";
import AIComposer, {
  type AIComposerSubmission,
} from "@/components/ui/ai-prompt-composer-with-model-selector";

export interface ComposerProps {
  onSend: (
    text: string,
    attachments: ChatAttachment[],
    modelId?: string,
    connectionId?: string
  ) => void;
  onStop?: () => void;
  status: SendMessageStatus;
  disabled?: boolean;
  catalog?: ChatModelCatalog;
  selectedModel?: string;
  selectedConnectionId?: string;
  onModelSelect?: (model: string, connectionId?: string) => void;
}

export function Composer({
  onSend,
  onStop,
  status,
  disabled,
  catalog,
  selectedModel,
  selectedConnectionId,
  onModelSelect,
}: ComposerProps) {
  const isStreaming = status !== "idle";

  const handleSubmit = async (submission: AIComposerSubmission) => {
    let readyAttachments: ChatAttachment[] = [];

    if (submission.files && submission.files.length > 0) {
      const limits = await fetchUploadLimits();
      const selected = submission.files.slice(0, limits.maxFilesPerMessage);
      const results = await Promise.all(
        selected.map((file) => processFile(file, limits))
      );
      readyAttachments = results;
    }

    const connId = submission.modelId === selectedModel && selectedConnectionId
      ? selectedConnectionId
      : catalog?.data?.find((d) => d.id === submission.modelId)?.connectionId;

    if (onModelSelect && submission.modelId) {
      onModelSelect(submission.modelId, connId);
    }

    onSend(submission.prompt, readyAttachments, submission.modelId, connId);
  };

  return (
    <div className="kantha-chat-composer">
      <AIComposer
        initialTheme="light"
        showUpgradeBanner={false}
        showWalkthroughControl={false}
        showThemeControl={false}
        className="aic-root kantha-composer flex w-full select-none flex-col items-center"
        placeholder="Ask anything, @ for context…"
        isStreaming={isStreaming}
        onStop={onStop}
        disabled={disabled}
        catalog={catalog}
        selectedModelId={selectedModel}
        onSubmit={handleSubmit}
        onModelSelect={onModelSelect}
      />

      <p className="kantha-chat-disclaimer mt-2 text-center text-xs">
        Kantha may make mistakes. Verify important information.
      </p>
    </div>
  );
}
