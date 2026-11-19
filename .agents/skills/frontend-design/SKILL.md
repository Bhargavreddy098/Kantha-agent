---
name: frontend-design
description: Pushes agents toward distinctive, intentional, production-grade UI design with high visual craft, avoiding generic AI styling.
---

# Frontend Design

Pushes agents toward distinctive, production-grade UI design with high visual craft, avoiding generic AI templates.

## Achromatic "Graphite Ink on Warm Paper" Foundation

### Color Palette

- **Hairline (`#0000001a`)**: 1px borders and dividers — rgba black at ~10% opacity, the sole structural separator.
- **Hover Veil (`#0000000d`)**: Supporting palette color for subtle hover wash (5% black). Never promote to primary CTA.
- **Ink Press (`#000000`)**: Pressed/inverted surface fill, tooltips, scrim — true black for max contrast moments.
- **Deep Charcoal (`#00000080`)**: Modal scrim overlay — 50% black behind dialogs and drawers.
- **Graphite Ink (`#0d0d0d`)**: Primary headings, body text, and icon fills on light surfaces.
- **Mid Ash (`#5d5d5d`)**: Secondary text and icons — supporting labels, metadata.
- **Hollow (`#8f8f8f`)**: Tertiary text, disabled states, muted helper copy.
- **Edge Gray (`#e6e6e6`)**: Stronger divider or inactive surface — used sparingly as a higher-contrast border alternative.
- **Sidebar Mist (`#f9f9f9`)**: Sidebar and secondary surface backgrounds — page chrome recedes behind conversation.
- **Pure White (`#ffffff`)**: Main canvas and elevated surface — primary reading area and panels.

### Typography Scale (Minor Second 1.067 from 16px Base)

- **heading**: `24px · 600 · 1.33` (Welcome headings only, modest display tier)
- **body**: `16px · 400 · 1.5` (Main reading and conversation text)
- **14px regular**: `14px · 400 · 1.43` (Descriptions, helper copy)
- **14px snug**: `14px · 400 · 1.29` (Dense metadata, list items)
- **14px medium**: `14px · 500 · 1.43` (Navigation items, interactive labels)
- **14px semibold**: `14px · 600 · 1.29` (Section headings, badge labels)

### System UI Fonts
- **Stack**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif`
- **Utility Choice**: Zero webfont load, native OS rendering, automatic dark-mode adaptation.

### Spatial Cadence & Geometry
- **Spacing**: 6px, 8px, 10px, 12px, 16px, 20px, 24px.
- **Border Radius**: 10px for cards, inputs, and buttons; 0px for badges; full pill for entry CTA.
- **Elevation**: 1px hairline border (`#0000001a`), never box shadows.
