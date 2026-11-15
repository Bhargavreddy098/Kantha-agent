"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { AttachmentChip } from "@/components/ui/attachment-chip";
import {
  PlusIcon,
  ArrowUpIcon,
  SquarePauseIcon,
  Sparkles,
  ChevronDown,
  Check,
  Search,
  Settings,
} from "lucide-react";
import { useChatDictation } from "@astryxdesign/core/Chat";
import { cn } from "@/lib/utils";

export type PromptInputProps = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  isBusy: boolean;
  stopPending?: boolean;
  onStop?: () => void;
  attachments?: string[];
  onRemoveAttachment?: (name: string) => void;
  disabled?: boolean;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  // Models integration inside the prompt input
  models?: string[];
  modelOptionLabels?: Record<string, string>;
  selectedModel?: string;
  onSelectModel?: (model: string) => void;
  onOpenSettings?: () => void;
};

export function PromptInput({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  isBusy,
  stopPending = false,
  onStop,
  attachments = [],
  onRemoveAttachment,
  disabled = false,
  placeholder = "Ask a question...",
  onFocus,
  onBlur,
  models = [],
  modelOptionLabels = {},
  selectedModel = "",
  onSelectModel,
  onOpenSettings,
}: PromptInputProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);

  const dictation = useChatDictation({
    onTranscript: (transcript, isFinal) => {
      if (isFinal) {
        onChange(value + transcript + " ");
      }
    },
    hasSounds: true,
  });

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    if (!modelDropdownOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setModelDropdownOpen(false);
      modelButtonRef.current?.focus();
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [modelDropdownOpen]);

  // Handle Enter key (without Shift) to submit
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isBusy && !disabled && value.trim() !== "") {
        onSubmit();
      }
    }
  };

  const canSend = value.trim() !== "" && !isBusy && !disabled;
  const filteredModels = models.filter((m) =>
    (modelOptionLabels[m] ?? m).toLowerCase().includes(modelSearch.toLowerCase().trim())
  );

  return (
    <form ref={formRef} onSubmit={(event) => {
      event.preventDefault();
      if (canSend) onSubmit();
    }} className="w-full">
      <InputGroup className="rounded-2xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 shadow-xs focus-within:border-neutral-400 focus-within:ring-2 focus-within:ring-neutral-200/60 dark:focus-within:ring-neutral-800">
        {/* Attachments - shown above the text area */}
        {attachments.length > 0 && (
          <InputGroupAddon align="block-start" className="flex-wrap gap-1 px-2 pt-1 pb-2">
            {attachments.map((name) => (
              <AttachmentChip
                key={name}
                name={name}
                onRemove={() => onRemoveAttachment?.(name)}
                size="sm"
              />
            ))}
          </InputGroupAddon>
        )}

        {/* Text input */}
        <InputGroupTextarea
          ref={textAreaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Chat message"
          disabled={disabled || isBusy}
          className={cn("px-3 py-1.5 text-sm min-h-[44px] max-h-[160px] leading-relaxed", isBusy && "opacity-60")}
          rows={1}
          onFocus={onFocus}
          onBlur={onBlur}
        />

        {/* Action toolbar inside prompt input */}
        <InputGroupAddon align="block-end" className="flex items-center justify-between w-full px-2 pt-1">
          {/* Left: Model Selector inside prompt input */}
          <div className="relative flex items-center gap-1.5" ref={dropdownRef}>
            {models.length > 0 ? (
              <button
                type="button"
                ref={modelButtonRef}
                aria-expanded={modelDropdownOpen}
                aria-label={"Select model. Current model: " + (modelOptionLabels[selectedModel] ?? selectedModel)}
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
                title="Select model"
              >
                <Sparkles className="size-3 text-blue-600" />
                <span className="max-w-[150px] truncate">{modelOptionLabels[selectedModel] || selectedModel || "Select Model"}</span>
                <ChevronDown className="size-3 text-neutral-400" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors cursor-pointer"
                title="Configure provider in Settings"
              >
                <Sparkles className="size-3 text-amber-600" />
                <span>Configure in Settings</span>
              </button>
            )}

            {/* Model selection dropdown menu */}
            {modelDropdownOpen && models.length > 0 && (
              <div className="absolute left-0 bottom-full mb-1.5 z-50 w-72 max-h-64 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl p-1.5 flex flex-col">
                <div className="px-2 py-1 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Models ({models.length})
                  </span>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={() => {
                        setModelDropdownOpen(false);
                        modelButtonRef.current?.focus();
                        onOpenSettings();
                      }}
                      className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Settings className="size-2.5" />
                      Settings
                    </button>
                  )}
                </div>

                {models.length > 5 && (
                  <div className="p-1 border-b border-neutral-100 dark:border-neutral-800">
                    <div className="relative">
                      <Search className="size-3 text-neutral-400 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        placeholder="Search models..."
                        aria-label="Search models"
                        className="w-full pl-6 pr-2 py-0.5 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 outline-none font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="overflow-y-auto max-h-44 py-1 space-y-0.5">
                  {filteredModels.map((m) => {
                    const isSelected = selectedModel === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          onSelectModel?.(m);
                          setModelDropdownOpen(false);
                          modelButtonRef.current?.focus();
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono text-left transition-colors cursor-pointer",
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium"
                            : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                        )}
                      >
                        <span className="truncate">{modelOptionLabels[m] ?? m}</span>
                        {isSelected && <Check className="size-3 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Dictation + Send/Stop */}
          <div className="flex items-center gap-1.5">
            {/* Dictation button */}
            {dictation.isListening ? (
              <InputGroupButton
                type="button"
                size="icon"
                variant="outline"
                className="rounded-full size-8"
                onClick={() => dictation.stop()}
                aria-label="Stop dictation"
              >
                <SquarePauseIcon className="size-3.5" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="button"
                size="icon"
                variant="ghost"
                className="rounded-full size-8 text-neutral-400 hover:text-neutral-700"
                onClick={() => dictation.start()}
                aria-label="Voice input"
              >
                <PlusIcon className="size-4" />
              </InputGroupButton>
            )}

            {/* Send / Stop button */}
            {isBusy ? (
              <InputGroupButton
                type="button"
                size="icon"
                variant="destructive"
                className="rounded-full size-8 bg-rose-600 hover:bg-rose-700 text-white"
                onClick={onStop}
                disabled={stopPending}
                aria-label={stopPending ? "Stopping generation" : "Stop generation"}
              >
                <SquarePauseIcon className="size-3.5" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon"
                variant="default"
                className="rounded-full size-8 bg-neutral-900 hover:bg-neutral-800 text-white disabled:opacity-30"
                disabled={!canSend}
                aria-label="Send"
              >
                <ArrowUpIcon className="size-4" />
              </InputGroupButton>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
