import React, { useState } from "react";
import { Button, IconButton, ScrollableArea } from "@astryxdesign/core";
import {
  Plus,
  Search,
  X,
  MessageSquare,
  Edit2,
  Trash2,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import {
  useConversations,
  groupConversationsByDate,
  renameConversation,
  deleteConversation,
} from "../db/useChatHistory";
import { RenameDialog } from "./RenameDialog";
import { DeleteDialog } from "./DeleteDialog";
import type { Conversation } from "../db/chatDb";

export interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeConversationId,
  onSelectConversation,
  onNewChat,
  themeMode,
  onToggleTheme,
  isCollapsed,
  onToggleCollapse,
  onOpenSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingConv, setRenamingConv] = useState<Conversation | null>(null);
  const [deletingConv, setDeletingConv] = useState<Conversation | null>(null);

  const conversations = useConversations(searchQuery);
  const grouped = groupConversationsByDate(conversations);

  if (isCollapsed) {
    return (
      <div
        style={{
          width: "56px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          borderRight: "1px solid var(--swiss-border)",
          backgroundColor: "var(--swiss-surface)",
          padding: "16px 0",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              backgroundColor: "var(--swiss-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.05em",
            }}
            title="Kantha AI"
          >
            K
          </div>

          <IconButton
            icon={<Plus size={18} />}
            label="New Chat"
            variant="ghost"
            size="sm"
            onClick={onNewChat}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <IconButton
            icon={<Settings size={16} />}
            label="Workbench Settings"
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
          />

          <IconButton
            icon={themeMode === "light" ? <Moon size={16} /> : <Sun size={16} />}
            label="Toggle Theme"
            variant="ghost"
            size="sm"
            onClick={onToggleTheme}
          />

          <IconButton
            icon={<ChevronRight size={16} />}
            label="Expand Sidebar"
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
          />
        </div>
      </div>
    );
  }

  const renderGroup = (label: string, items: Conversation[]) => {
    if (items.length === 0) return null;

    return (
      <div key={label} style={{ marginBottom: "20px" }}>
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--swiss-text-secondary)",
            padding: "0 12px 6px 12px",
          }}
        >
          {label}
        </div>

        {items.map((conv) => {
          const isActive = conv.id === activeConversationId;
          return (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px 8px 14px",
                cursor: "pointer",
                backgroundColor: isActive ? "var(--swiss-hover)" : "transparent",
                borderLeft: isActive ? "2px solid var(--swiss-accent)" : "2px solid transparent",
                marginBottom: "2px",
                transition: "background-color 120ms ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = "var(--swiss-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                <MessageSquare
                  size={14}
                  style={{
                    color: isActive ? "var(--swiss-accent)" : "var(--swiss-text-secondary)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 400,
                    color: "var(--swiss-text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {conv.title}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                  marginLeft: "8px",
                  opacity: isActive ? 1 : 0.4,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  title="Rename"
                  onClick={() => setRenamingConv(conv)}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: "4px",
                    color: "var(--swiss-text-secondary)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <Edit2 size={12} />
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => setDeletingConv(conv)}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: "4px",
                    color: "var(--swiss-text-secondary)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      style={{
        width: "280px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--swiss-border)",
        backgroundColor: "var(--swiss-surface)",
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--swiss-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              backgroundColor: "var(--swiss-accent)",
            }}
          />
          <span
            style={{
              fontSize: "13px",
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--swiss-text)",
            }}
          >
            Kantha Swiss
          </span>
        </div>

        <IconButton
          icon={<ChevronLeft size={16} />}
          label="Collapse Sidebar"
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
        />
      </div>

      {/* Primary Action: New Chat */}
      <div style={{ padding: "16px 16px 12px 16px" }}>
        <Button
          label="Create new chat"
          variant="primary"
          size="md"
          onClick={onNewChat}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            backgroundColor: "var(--swiss-text)",
            color: "var(--swiss-surface)",
            border: "none",
            borderRadius: "0px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={16} />
          <span>New Chat</span>
        </Button>
      </div>

      {/* Search Input */}
      <div style={{ padding: "0 16px 16px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "var(--swiss-bg)",
            border: "1px solid var(--swiss-border)",
            padding: "6px 10px",
            gap: "8px",
          }}
        >
          <Search size={14} style={{ color: "var(--swiss-text-secondary)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: "none",
              backgroundColor: "transparent",
              color: "var(--swiss-text)",
              fontSize: "12px",
              width: "100%",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: 0,
                color: "var(--swiss-text-secondary)",
                display: "flex",
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* History List */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ScrollableArea label="Conversation history" style={{ height: "100%", padding: "4px 0" }}>
          {conversations.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontSize: "12px",
                color: "var(--swiss-text-secondary)",
              }}
            >
              {searchQuery ? "No matching conversations." : "No conversation history."}
            </div>
          ) : (
            <>
              {renderGroup("Today", grouped.today)}
              {renderGroup("Yesterday", grouped.yesterday)}
              {renderGroup("Previous 7 Days", grouped.previous7Days)}
              {renderGroup("Older", grouped.older)}
            </>
          )}
        </ScrollableArea>
      </div>

      {/* Pinned Bottom Settings & Controls */}
      <div
        style={{
          borderTop: "1px solid var(--swiss-border)",
          backgroundColor: "var(--swiss-surface)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Settings Action Button */}
        <div
          onClick={onOpenSettings}
          style={{
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            cursor: "pointer",
            borderBottom: "1px solid var(--swiss-border)",
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--swiss-text)",
            transition: "background-color 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--swiss-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Settings size={15} style={{ color: "var(--swiss-text-secondary)" }} />
          <span>Workbench Settings</span>
        </div>

        {/* Footer Meta & Quick Toggle */}
        <div
          style={{
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "var(--swiss-text-secondary)",
          }}
        >
          <span style={{ letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
            {conversations.length} {conversations.length === 1 ? "Thread" : "Threads"}
          </span>

          <IconButton
            icon={themeMode === "light" ? <Moon size={14} /> : <Sun size={14} />}
            label={themeMode === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            variant="ghost"
            size="sm"
            onClick={onToggleTheme}
          />
        </div>
      </div>

      {/* Dialogs */}
      {renamingConv && (
        <RenameDialog
          isOpen={Boolean(renamingConv)}
          initialTitle={renamingConv.title}
          onClose={() => setRenamingConv(null)}
          onRename={(newTitle) => renameConversation(renamingConv.id, newTitle)}
        />
      )}

      {deletingConv && (
        <DeleteDialog
          isOpen={Boolean(deletingConv)}
          title={deletingConv.title}
          onClose={() => setDeletingConv(null)}
          onConfirm={() => deleteConversation(deletingConv.id)}
        />
      )}
    </div>
  );
};
