/**
 * Swiss International Typographic Style Design Tokens & Palette
 */

export const swissColors = {
  light: {
    background: "#F8F8F6", // Warm off-white canvas
    surface: "#FFFFFF", // Pure white for cards/panels
    text: "#171717", // High-contrast near-black
    textSecondary: "#737373", // Neutral gray
    border: "#E5E5E3", // Subtle hairline divider
    accent: "#E53935", // Swiss red accent
    hover: "#F0F0EE", // Refined hover surface
  },
  dark: {
    background: "#141414", // Deep neutral dark
    surface: "#1F1F1F", // Elevated dark surface
    text: "#F5F5F5", // High-contrast crisp white
    textSecondary: "#A3A3A3", // Muted light gray
    border: "#2E2E2E", // Hairline border
    accent: "#E53935", // Swiss red accent
    hover: "#282828", // Subtle dark hover
  },
};

export type ThemeMode = "light" | "dark";

export const FONT_SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
export const FONT_MONO = "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace";
