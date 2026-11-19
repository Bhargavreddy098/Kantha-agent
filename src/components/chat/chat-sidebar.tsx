"use client";

import { MessageSquare, PanelLeftClose, Plus, Settings, Sparkles, Trash2 } from "lucide-react";
import type { StoredConversation } from "@/types/chat";
import { cn } from "@/lib/utils";

export interface ChatSidebarProps {
  conversations: StoredConversation[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  isOpen: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  onOpenSettings,
  isOpen,
  mobileOpen,
  onCloseMobile,
}: ChatSidebarProps) {
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onCloseMobile} aria-hidden="true" />
      )}

      <aside
        id="kantha-chat-sidebar"
        aria-label="Chat sidebar"
        className={cn(
          "kantha-chat-sidebar fixed inset-y-0 left-0 z-40 shrink-0 flex-col md:static",
          isOpen ? "md:flex" : "md:hidden",
          mobileOpen ? "flex" : "hidden",
        )}
      >
        <div className="flex items-center gap-2">
          <button type="button" className="kantha-chat-nav flex-1" onClick={onNewChat}>
            <Plus size={18} strokeWidth={1.65} />
            New chat
          </button>
          <button type="button" className="kantha-chat-icon inline-flex md:hidden" onClick={onCloseMobile} aria-label="Close sidebar">
            <PanelLeftClose size={17} strokeWidth={1.65} />
          </button>
        </div>

        <nav aria-label="Recents" className="kantha-chat-recents flex min-h-0 flex-1 flex-col">
          <h2>Recents</h2>
          {conversations.length === 0 ? (
            <p className="kantha-chat-empty-recents">No past chats yet</p>
          ) : (
            <ul className="min-h-0 space-y-1 overflow-y-auto">
              {conversations.map((conversation) => (
                <li
                  key={conversation.id}
                  className={cn("kantha-chat-recent group relative", conversation.id === activeId && "is-current")}
                >
                  <button
                    type="button"
                    aria-current={conversation.id === activeId ? "page" : undefined}
                    onClick={() => onSelect(conversation.id)}
                    className="kantha-chat-nav pr-9"
                  >
                    <MessageSquare size={17} strokeWidth={1.65} />
                    <span className="min-w-0 truncate">{conversation.title || "New chat"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(conversation.id)}
                    className="kantha-chat-delete kantha-chat-icon inline-flex md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                    title="Delete chat"
                    aria-label={`Delete chat: ${conversation.title || "New chat"}`}
                  >
                    <Trash2 size={15} strokeWidth={1.65} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="space-y-1 pb-1">
          <button type="button" className="kantha-chat-nav" onClick={onNewChat}>
            <Sparkles size={17} strokeWidth={1.65} />
            Start Fresh
          </button>
          <button type="button" className="kantha-chat-nav" onClick={onOpenSettings}>
            <Settings size={17} strokeWidth={1.65} />
            Settings
          </button>
        </div>
      </aside>
    </>
  );
}
