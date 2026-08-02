# Design System

This document defines the design tokens and UI foundations used across the platform. It ensures
consistency in colors, typography, spacing, and component styling.

---

## Colors

The platform uses a minimal, theme-based color system powered by CSS variables and Tailwind.

### Primary Colors

| Token                | Value                                | Usage           |
| -------------------- | ------------------------------------ | --------------- |
| `--color-background` | `#ffffff` (light) / `#0a0a0a` (dark) | Page background |
| `--color-foreground` | `#171717` (light) / `#ededed` (dark) | Main text       |

### Usage in Tailwind

These are mapped via Tailwind theme:

```css
--color-background: var(--background);
--color-foreground: var(--foreground);
```
