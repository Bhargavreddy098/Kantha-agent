---
name: ui-ux-pro-max-skill
description: Searchable design intelligence, tokens, achromatic palettes, and UX rules following ChatGPT's graphite ink on warm paper style reference.
---

# ChatGPT — Style Reference
> graphite ink on warm paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ChatGPT uses a graphite-on-paper language: near-white canvas (#f9f9f9 sidebar) with the main conversation surface staying white, near-black ink for all primary text and icons, and zero chromatic accents. The entire UI is achromatic — meaning is carried by weight (600 headings, 400 body, 500 for emphasis) and spatial rhythm rather than color. Surfaces stay flat; elevation comes from a single hairline border at 1px rgba(0,0,0,0.05) rather than shadow. Controls are small, square-ish (10px radius), and chrome-light so the written response dominates. The system reads as restrained utility software — every pixel earns its place.

## Color Palette

| Name | Hex Value | Token | Role & Description |
|------|-----------|-------|--------------------|
| Hairline | `#0000001a` | `--color-hairline` | 1px borders and dividers — rgba black at ~10% opacity, the sole structural separator |
| Hover Veil | `#0000000d` | `--color-hover-veil` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |
| Ink Press | `#000000` | `--color-ink-press` | Pressed/inverted surface fill, tooltips, scrim — true black for max contrast moments |
| Deep Charcoal | `#00000080` | `--color-deep-charcoal` | Modal scrim overlay — 50% black behind dialogs and drawers |
| Graphite Ink | `#0d0d0d` | `--color-graphite-ink` | Primary headings, body text, and icon fills on light surfaces. Do not promote it to the primary CTA color |
| Mid Ash | `#5d5d5d` | `--color-mid-ash` | Secondary text and icons — supporting labels, metadata |
| Hollow | `#8f8f8f` | `--color-hollow` | Tertiary text, disabled states, muted helper copy |
| Edge Gray | `#e6e6e6` | `--color-edge-gray` | Stronger divider or inactive surface — used sparingly as a higher-contrast border alternative |
| Sidebar Mist | `#f9f9f9` | `--color-sidebar-mist` | Sidebar and secondary surface backgrounds — page chrome recedes behind the conversation |
| Pure White | `#ffffff` | `--color-pure-white` | Main canvas and elevated surface — primary reading area, elevated panels, inverted text backgrounds |

## Typography

### Type Scale
Minor Second (1.067) from 16px base:

| Tier | Size | Weight | Line Height | Usage / Sample |
|------|------|--------|-------------|----------------|
| **heading** | 24px | 600 | 1.33 | Welcome headings (`The quick brown fox jumps`) |
| **body** | 16px | 400 | 1.5 | Main reading text (`The quick brown fox jumps`) |
| **14px caption regular** | 14px | 400 | 1.43 | Standard fine print, helper descriptions |
| **14px caption snug** | 14px | 400 | 1.29 | Compact metadata rows, list previews |
| **14px caption medium** | 14px | 500 | 1.43 | Navigation items, button text, medium emphasis |
| **14px caption semibold** | 14px | 600 | 1.29 | Section labels, badge titles, compact headings |

### Fonts
- **Display / Family:** `-apple-system-body`
- **Fallback:** `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Weights:** 400 (regular), 500 (medium), 600 (semibold)
- **Sizes:** 14px, 16px, 24px
- **Line height:** 1.43 (caption base) / 1.5 (body) / 1.33 (heading)
- **Letter spacing:** normal (0px)
- **Philosophy:** System UI font — the entire interface renders in -apple-system / BlinkMacSystemFont / Segoe UI, inheriting the OS typeface rather than shipping a custom face. This is a deliberate utility choice: zero font load, native rendering, automatic dark-mode adaptation on macOS/iOS. Body copy sits at 16px/1.5, fine print at 14px/1.43. The 24px/600 step is the sole display tier, reserved for welcome headings — never stretched for marketing drama.

## Tokens — Spacing & Shapes

**Density:** compact

### Spacing Scale
- 6px (`--spacing-6`)
- 8px (`--spacing-8`)
- 10px (`--spacing-10`)
- 12px (`--spacing-12`)
- 16px (`--spacing-16`)
- 20px (`--spacing-20`)

### Border Radius
- Nav: `10px`
- Cards: `10px`
- Links: `16px`
- Badges: `0px`
- Buttons: `10px`
- Pill CTA: `9999px`
