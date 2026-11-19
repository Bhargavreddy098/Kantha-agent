"use client";

import { PanelLeft, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatHeaderProps {
  onNewChat: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
}

export function ChatHeader({
  onNewChat,
  onOpenSettings,
  onToggleSidebar,
  sidebarOpen,
  mobileSidebarOpen,
}: ChatHeaderProps) {
  return (
    <header className="kantha-chat-header">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={cn("kantha-chat-icon hidden md:inline-flex", sidebarOpen && "is-pressed")}
          onClick={onToggleSidebar}
          aria-controls="kantha-chat-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <PanelLeft size={17} strokeWidth={1.65} />
        </button>
        <button
          type="button"
          className="kantha-chat-icon inline-flex md:hidden"
          onClick={onToggleSidebar}
          aria-controls="kantha-chat-sidebar"
          aria-expanded={mobileSidebarOpen}
          aria-label={mobileSidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <PanelLeft size={17} strokeWidth={1.65} />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button type="button" className="kantha-chat-icon inline-flex" onClick={onNewChat} aria-label="New conversation" title="New conversation">
          <Plus size={18} strokeWidth={1.65} />
        </button>
        <button type="button" className="kantha-chat-icon inline-flex" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <Settings size={17} strokeWidth={1.65} />
        </button>
      </div>
    </header>
  );
}
