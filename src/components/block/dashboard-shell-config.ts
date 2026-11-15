import {
  FolderKanban,
  Settings,
  MessageSquare,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const navigation = [
  {
    id: "main",
    title: "Main",
    items: [
      // Hash links keep the workspace views on the root route, so they work
      // from every page in the app.
      { id: "projects", label: "Projects", icon: FolderKanban, href: "/#projects" },
      { id: "chat", label: "Chat", icon: MessageSquare, href: "/chat" },
    ],
  },
];

/** Pinned under the main navigation, at the bottom of the sidebar.
 * Links directly to the /settings page route.
 */
export const secondaryNavigation = [
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
];
