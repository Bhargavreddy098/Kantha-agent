"use client";

/**
 * Minimal local prompt composer with a model selector.
 *
 * The previous workspace imported `@/components/ui/ai-prompt-composer-with-model-selector`
 * but the module was never committed. This is a behaviour-compatible replacement that
 * keeps the existing `Composer` contract intact: it gathers prompt text, files and a
 * selected model, then hands a normalized `AIComposerSubmission` to `onSubmit`.
 *
 * It intentionally uses semantic HTML instead of adding a new dependency. The richer
 * Astryx composer can be adopted later without changing callers.
 */

import * as React from "react";
import type { ChatModelCatalog } from "@/types/chat";
import { cn } from "@/lib/utils";

export interface AIComposerSubmission {
  prompt: string;
  files: File[];
  modelId?: string;
}

export interface AIComposerProps {
  /** Accepted for API compatibility; the local composer follows the app theme. */
  initialTheme?: string;
  /** Accepted for API compatibility; upgrade/walkthrough/theme controls are omitted. */
  showUpgradeBanner?: boolean;
  showWalkthroughControl?: boolean;
  showThemeControl?: boolean;
  className?: string;
  placeholder?: string;
  isStreaming?: boolean;
  onStop?: () => void;
  disabled?: boolean;
  catalog?: ChatModelCatalog;
  selectedModelId?: string;
  onSubmit: (submission: AIComposerSubmission) => void | Promise<void>;
  onModelSelect?: (model: string, connectionId?: string) => void;
}

export function AIComposer({
  className,
  placeholder = "Ask anything, @ for context…",
  isStreaming = false,
  onStop,
  disabled = false,
  catalog,
  selectedModelId,
  onSubmit,
  onModelSelect,
}: AIComposerProps) {
  const [prompt, setPrompt] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [modelId, setModelId] = React.useState(selectedModelId ?? "");

  React.useEffect(() => {
    if (selectedModelId) setModelId(selectedModelId);
  }, [selectedModelId]);

  const models = catalog?.data ?? [];
  const canSubmit =
    !disabled && !isStreaming && prompt.trim().length > 0;

  const handleModelChange = (next: string) => {
    setModelId(next);
    const entry = models.find((model) => model.id === next);
    onModelSelect?.(next, entry?.connectionId);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const submission: AIComposerSubmission = {
      prompt: prompt.trim(),
      files,
      modelId: modelId || undefined,
    };
    setPrompt("");
    setFiles([]);
    void onSubmit(submission);
  };

  return (
    <form
      className={cn("flex w-full flex-col gap-2", className)}
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor="kantha-composer-prompt">
        Message
      </label>
      <textarea
        id="kantha-composer-prompt"
        className="kantha-composer-input min-h-20 w-full resize-y rounded-xl border border-neutral-300 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-neutral-500"
        placeholder={placeholder}
        value={prompt}
        disabled={disabled}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSubmit(event);
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {models.length > 0 && (
            <>
              <label className="sr-only" htmlFor="kantha-composer-model">
                Model
              </label>
              <select
                id="kantha-composer-model"
                className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800"
                value={modelId}
                disabled={disabled}
                onChange={(event) => handleModelChange(event.target.value)}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name || model.id}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="cursor-pointer text-xs text-neutral-600">
            Attach files
            <input
              type="file"
              multiple
              className="sr-only"
              disabled={disabled}
              onChange={(event) =>
                setFiles(Array.from(event.target.files ?? []))
              }
            />
          </label>
          {files.length > 0 && (
            <span className="text-[11px] text-neutral-500">
              {files.length} file{files.length === 1 ? "" : "s"} attached
            </span>
          )}
        </div>

        {isStreaming ? (
          <button
            type="button"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-100"
            onClick={onStop}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSubmit}
          >
            Send
          </button>
        )}
      </div>
    </form>
  );
}

export default AIComposer;
