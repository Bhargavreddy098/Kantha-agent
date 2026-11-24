/**
 * Swiss International Typographic Style Design Tokens (Geist + Neutral Grid)
 */

export const swissColors = {
  light: {
    background: "#F7F7F5",
    surface: "#FFFFFF",
    surfaceMuted: "#F0F0ED",
    text: "#111111",
    textSecondary: "#595956",
    border: "#DFDFDC",
    borderStrong: "#111111",
    accent: "#D92D20",
    hover: "#EFEFED",
  },
  dark: {
    background: "#111111",
    surface: "#181818",
    surfaceMuted: "#202020",
    text: "#F4F4F2",
    textSecondary: "#A0A09C",
    border: "#2A2A2A",
    borderStrong: "#F4F4F2",
    accent: "#EF4444",
    hover: "#222222",
  },
};

export type ThemeMode = "light" | "dark";

export const FONT_SANS =
  "'Geist', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
export const FONT_MONO =
  "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
