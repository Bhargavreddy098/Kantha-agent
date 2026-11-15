"use client";

import {
  DashboardShell,
  DashboardButton,
  DashboardMenu,
  DashboardMenuTrigger,
  DashboardMenuContent,
  DashboardMenuItem,
  DashboardMenuLabel,
  DashboardMenuSeparator,
  DashboardFilterMenu,
  DashboardConfirmDialog,
} from "@/components/block/dashboard-shell";
import {
  Bell,
  Search,
  Plus,
  Download,
  User,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { navigation, secondaryNavigation } from "@/components/block/dashboard-shell-config";
import {
  SettingsDialog,
  type SettingsSection,
} from "@/components/block/settings-dialog";

const sortOptions = [
  { value: "recent", label: "Most Recent" },
  { value: "name", label: "Name (A–Z)" },
  { value: "updated", label: "Recently Updated" },
];

const filterOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("overview");
  const [activeItem, setActiveItem] = useState("projects");
  const [sortValue, setSortValue] = useState("recent");
  const [filterValue, setFilterValue] = useState("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => () => {});

  // Settings Open Dialog State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("model-providers");

  // Handlers for Settings Dialog
  const handleOpenSettings = useCallback((section: SettingsSection = "model-providers") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    if (
      window.location.hash === "#settings" ||
      window.location.hash === "#model-providers" ||
      window.location.hash === "#help"
    ) {
      window.history.pushState(null, "", window.location.pathname);
    }
  }, []);

  // Sync with URL hash
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "settings" || hash === "model-providers") {
        handleOpenSettings("model-providers");
      } else if (hash === "help") {
        handleOpenSettings("help");
      } else if (hash === "projects") {
        setActiveItem("projects");
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [handleOpenSettings]);

  return (
    <div className="h-dvh">
      <DashboardShell
        brand={{ name: "ObsidianUI", description: "Dashboard shell demo" }}
        navigation={navigation}
        secondaryNavigation={secondaryNavigation}
        activeItemId={activeItem}
        onActiveItemChange={(id) => {
          if (id === "settings") {
            handleOpenSettings("model-providers");
          } else {
            setActiveItem(id);
            if (id === "projects") {
              window.location.hash = "projects";
            }
          }
        }}
        title="Projects"
        headerActions={
          <>
            <DashboardButton variant="ghost" size="icon" aria-label="Search">
              <Search />
            </DashboardButton>
            <DashboardMenu>
              <DashboardMenuTrigger asChild>
                <DashboardButton variant="ghost" size="icon" aria-label="Notifications">
                  <Bell />
                </DashboardButton>
              </DashboardMenuTrigger>
              <DashboardMenuContent align="end">
                <DashboardMenuLabel>Notifications</DashboardMenuLabel>
                <DashboardMenuItem>No new notifications</DashboardMenuItem>
              </DashboardMenuContent>
            </DashboardMenu>
            <DashboardMenu>
              <DashboardMenuTrigger asChild>
                <DashboardButton variant="ghost" size="icon" aria-label="User menu">
                  <User className="size-4" />
                </DashboardButton>
              </DashboardMenuTrigger>
              <DashboardMenuContent align="end" className="w-48">
                <DashboardMenuLabel>Account</DashboardMenuLabel>
                <DashboardMenuItem>Profile</DashboardMenuItem>
                <DashboardMenuItem onClick={() => handleOpenSettings("model-providers")}>
                  Settings
                </DashboardMenuItem>
                <DashboardMenuSeparator />
                <DashboardMenuItem>Log out</DashboardMenuItem>
              </DashboardMenuContent>
            </DashboardMenu>
          </>
        }
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "reports", label: "Reports" },
        ]}
        tab={activeTab}
        onTabChange={setActiveTab}
        filters={
          <>
            <DashboardFilterMenu
              label="Sort"
              value={sortValue}
              options={sortOptions}
              onValueChange={setSortValue}
            />
            <DashboardFilterMenu
              label="Filter"
              value={filterValue}
              options={filterOptions}
              onValueChange={setFilterValue}
            />
          </>
        }
        toolbarActions={
          <>
            <DashboardButton variant="secondary" size="sm">
              <Download className="size-3.5" />
              Export
            </DashboardButton>
            <DashboardButton variant="primary" size="sm">
              <Plus className="size-3.5" />
              New Project
            </DashboardButton>
          </>
        }
        sidebarWidth={240}
        defaultSidebarWidth={240}
        linkComponent={Link}
      >
        {/* Workspace Dashboard Content */}
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">
              {activeTab === "overview" && "Overview"}
              {activeTab === "reports" && "Reports"}
            </h2>
            <p className="text-sm text-(--obsidian-dashboard-shell-text-muted)">
              Current view: <code className="bg-(--obsidian-dashboard-shell-muted) px-1.5 py-0.5 rounded text-xs font-mono">{activeTab}</code>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {["Total Projects", "Active Tasks", "Team Members", "Completed Today", "Pending Review", "Overdue"].map((stat, i) => (
              <div
                key={stat}
                className="rounded-xl border border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-panel) p-5 transition-shadow hover:shadow-(--obsidian-dashboard-shell-control-shadow)"
              >
                <p className="text-sm text-(--obsidian-dashboard-shell-text-subtle)">{stat}</p>
                <p className="mt-1 text-3xl font-bold text-(--obsidian-dashboard-shell-foreground)">
                  {["24", "18", "12", "6", "3", "1"][i]}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-panel) p-5">
            <h3 className="text-lg font-medium">Recent Activity</h3>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                "Created new project “Website Redesign”",
                "Completed task “Update dependencies”",
                "Added 3 new team members",
                "Published analytics report",
                "Resolved 2 critical issues",
              ].map((item, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 text-(--obsidian-dashboard-shell-text-muted) hover:text-(--obsidian-dashboard-shell-foreground) transition-colors"
                >
                  <span className="relative flex h-2 w-2 rounded-full bg-(--obsidian-dashboard-shell-accent)" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3">
            <DashboardButton variant="secondary" onClick={() => setConfirmAction(() => alert("Exported!"))}>
              <Download className="size-3.5 mr-2" />
              Export Data
            </DashboardButton>
            <DashboardButton variant="muted" onClick={() => setConfirmAction(() => alert("Invited!"))}>
              <Plus className="size-3.5 mr-2" />
              Invite Team
            </DashboardButton>
            <DashboardButton variant="danger" onClick={() => {
              setConfirmAction(() => alert("Archive confirmed"));
              setConfirmOpen(true);
            }}>
              Archive Project
            </DashboardButton>
          </div>
        </div>
      </DashboardShell>

      {/* Settings Card Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseSettings();
          else setSettingsOpen(true);
        }}
        initialSection={settingsSection}
      />

      <DashboardConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Archive project?"
        description="This will move the project to the archive. Team members will lose access, but data will be preserved."
        confirmLabel="Archive"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          confirmAction();
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}
