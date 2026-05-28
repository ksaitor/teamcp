# TeamRouter

## Styling & dark mode

This app supports light **and** dark mode, and every screen must work in both. Dark mode is class-based via `next-themes` (`<html class="dark">`), wired in `src/app/layout.tsx` through `src/components/theme-provider.tsx`. The toggle lives at the bottom of the dashboard sidebar (`src/components/theme-toggle.tsx`).

**Rule: never use literal color classes in `className`.** Do not write `bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*`, or raw status colors like `bg-green-100`/`text-red-700`. These only look right in light mode and silently break dark mode.

**Always use the shadcn semantic tokens** (defined in `src/app/globals.css` `@theme` + `:root`/`.dark` blocks). They flip automatically between modes:

| Use for | Token classes |
|---|---|
| Page background / text | `bg-background` / `text-foreground` |
| Cards, panels, table rows, sidebar | `bg-card` (`text-card-foreground`) |
| Muted/secondary text | `text-muted-foreground` |
| Borders / dividers | `border-border` / `divide-border` |
| Inputs | `border-input`, focus `focus:border-ring` / `focus-visible:ring-ring` |
| Hover surfaces | `hover:bg-accent hover:text-accent-foreground` |
| Primary buttons/links | `bg-primary text-primary-foreground hover:bg-primary/90` |
| Neutral badges | `bg-muted text-muted-foreground` |
| Destructive (errors, delete) | `text-destructive`, solid: `bg-destructive text-white` |
| Success / warning / info badges | `bg-success/10 text-success`, `bg-warning/10 text-warning`, `bg-info/10 text-info` (solid: `bg-success text-white`, etc.) |

`success`, `warning`, and `info` are custom tokens added on top of the stock shadcn palette (shadcn only ships `destructive`). Add new semantic tokens to all three blocks in `globals.css` (`@theme inline`, `:root`, `.dark`) rather than hardcoding colors.

We use shadcn's **theming foundation only** — the token CSS and `cn()` helper (`src/lib/utils.ts`). We have not adopted shadcn's Radix components; build UI with plain elements styled via the tokens above.
