import React, { useState } from "react";
import {
  Button,
  Divider,
  HStack,
  IconButton,
  List,
  ListItem,
  ScrollableArea,
  Text,
  TextInput,
  VStack,
} from "@astryxdesign/core";
import {
  Plus,
  Search,
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
      <VStack
        justify="space-between"
        align="center"
        style={{
          width: "56px",
          height: "100%",
          borderRight: "1px solid var(--swiss-border)",
          backgroundColor: "var(--swiss-surface)",
          padding: "14px 0",
        }}
      >
        <VStack align="center" gap="14px">
          <div
            style={{
              width: "26px",
              height: "26px",
              backgroundColor: "var(--swiss-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              fontWeight: 700,
            }}
            title="Kantha Workbench"
          >
            K
          </div>

          <IconButton
            icon={<Plus size={16} />}
            label="New Chat"
            variant="ghost"
            size="sm"
            onClick={onNewChat}
          />
        </VStack>

        <VStack align="center" gap="8px">
          <IconButton
            icon={<Settings size={15} />}
            label="Workbench Settings"
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
          />
          <IconButton
            icon={themeMode === "light" ? <Moon size={15} /> : <Sun size={15} />}
            label="Toggle Theme"
            variant="ghost"
            size="sm"
            onClick={onToggleTheme}
          />
          <IconButton
            icon={<ChevronRight size={15} />}
            label="Expand Sidebar"
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
          />
        </VStack>
      </VStack>
    );
  }

  const renderGroup = (label: string, items: Conversation[]) => {
    if (items.length === 0) return null;

    return (
      <VStack key={label} gap="4px" style={{ marginBottom: "16px", padding: "0 10px" }}>
        <Text
          size="xs"
          weight="semibold"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--swiss-text-secondary)",
            padding: "4px 6px",
          }}
        >
          {label}
        </Text>

        <List>
          {items.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <ListItem
                key={conv.id}
                label={
                  <Text
                    size="sm"
                    weight={isActive ? "semibold" : "regular"}
                    maxLines={1}
                    style={{
                      color: isActive ? "var(--swiss-text)" : "var(--swiss-text-secondary)",
                    }}
                  >
                    {conv.title}
                  </Text>
                }
                startContent={
                  <MessageSquare
                    size={13}
                    style={{
                      color: isActive ? "var(--swiss-accent)" : "var(--swiss-text-secondary)",
                    }}
                  />
                }
                endContent={
                  <HStack gap="2px" onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      icon={<Edit2 size={12} />}
                      label={`Rename ${conv.title}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => setRenamingConv(conv)}
                    />
                    <IconButton
                      icon={<Trash2 size={12} />}
                      label={`Delete ${conv.title}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingConv(conv)}
                    />
                  </HStack>
                }
                onClick={() => onSelectConversation(conv.id)}
                style={{
                  backgroundColor: isActive ? "var(--swiss-hover)" : "transparent",
                  borderRadius: "2px",
                  cursor: "pointer",
                }}
              />
            );
          })}
        </List>
      </VStack>
    );
  };

  return (
    <VStack
      style={{
        width: "272px",
        height: "100%",
        borderRight: "1px solid var(--swiss-border)",
        backgroundColor: "var(--swiss-surface)",
      }}
    >
      {/* Swiss Brand Header */}
      <HStack
        justify="space-between"
        align="center"
        style={{
          height: "52px",
          padding: "0 14px",
          borderBottom: "1px solid var(--swiss-border)",
          flexShrink: 0,
        }}
      >
        <HStack align="center" gap="10px">
          <div
            style={{
              width: "10px",
              height: "10px",
              backgroundColor: "var(--swiss-accent)",
              flexShrink: 0,
            }}
          />
          <Text
            size="xs"
            weight="bold"
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--swiss-text)",
            }}
          >
            KANTHA
          </Text>
        </HStack>

        <IconButton
          icon={<ChevronLeft size={15} />}
          label="Collapse Sidebar"
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
        />
      </HStack>

      {/* Primary Action & Search */}
      <VStack gap="10px" style={{ padding: "14px 12px 12px 12px", flexShrink: 0 }}>
        <Button
          label="Create new chat"
          variant="primary"
          size="md"
          width="100%"
          icon={<Plus size={15} />}
          onClick={onNewChat}
        >
          New Thread
        </Button>

        <TextInput
          label="Search threads"
          isLabelHidden
          size="sm"
          placeholder="Filter threads..."
          value={searchQuery}
          onChange={setSearchQuery}
          startIcon={<Search size={13} />}
          hasClear
        />
      </VStack>

      <Divider />

      {/* History List */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <ScrollableArea label="Conversation history" style={{ height: "100%", padding: "8px 0" }}>
          {conversations.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center" }}>
              <Text size="xs" style={{ color: "var(--swiss-text-secondary)" }}>
                {searchQuery ? "No matching threads." : "No saved threads yet."}
              </Text>
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

      {/* Pinned Footer */}
      <Divider />
      <VStack style={{ padding: "10px 12px", gap: "8px", flexShrink: 0 }}>
        <Button
          label="Workbench Settings"
          variant="ghost"
          size="sm"
          width="100%"
          icon={<Settings size={14} />}
          onClick={onOpenSettings}
          style={{ justifyContent: "flex-start" }}
        >
          Provider &amp; Model Settings
        </Button>

        <HStack justify="space-between" align="center" style={{ padding: "0 4px" }}>
          <Text
            size="xs"
            hasTabularNumbers
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--swiss-text-secondary)",
            }}
          >
            {conversations.length} {conversations.length === 1 ? "THREAD" : "THREADS"}
          </Text>

          <IconButton
            icon={themeMode === "light" ? <Moon size={14} /> : <Sun size={14} />}
            label={themeMode === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            variant="ghost"
            size="sm"
            onClick={onToggleTheme}
          />
        </HStack>
      </VStack>

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
    </VStack>
  );
};
