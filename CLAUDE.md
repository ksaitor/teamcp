# TeamRouter

TeamRouter is an open-core **MCP gateway** that gives organizations fine-grained, per-employee access to data sources (databases, SaaS APIs, other MCP servers). Each employee gets a personalized tool list scoped to what the org owner permitted. The canonical product name is **TeamRouter** (renamed from "TeamMCP" — don't reintroduce the old name). The primary user is a slightly-technical business owner, so the admin UI must stay approachable for non-technical people.

## Commands & tooling

Package manager is **Bun** (`bun.lock`) — use `bun` / `bunx`, never npm/pnpm/yarn.

| Command | What it does |
|---|---|
| `bun run dev` | Next.js admin UI (Turbopack) on port 3000 |
| `bun run build` | Production build |
| `bun run start` | `bin/start.sh`: runs `bunx prisma db push`, then launches **both** the admin UI (:3000) and the MCP gateway (:3001) |
| `bun run mcp:dev` | Run the MCP gateway alone (`src/server/index.ts`) |
| `bun run db:generate` / `db:push` / `db:migrate` / `db:studio` | Prisma client / schema sync / migrations / studio |

This is a **dual-server app**: the Next.js admin UI and the MCP gateway run as separate processes.

## Architecture map

| Concern | Location |
|---|---|
| Admin UI (App Router) | `src/app/(auth)` public routes, `src/app/(dashboard)` protected routes, `src/app/api/*` REST mutations |
| MCP gateway | `src/server/` — `index.ts` (tool-call pipeline), `auth.ts` (MCP token auth) |
| Access control | `src/permissions/` + `src/ai/filter.ts` + `src/approvals/` |
| Connectors (pluggable) | `src/connectors/` — implement `interface.ts`, register in `registry.ts` (postgres / mongodb / stripe / external-mcp) |
| Data | Prisma + PostgreSQL; schema `prisma/schema.prisma`; client singleton `src/db/index.ts` |
| Auth | NextAuth v5 in `src/auth.ts`; env validated via Zod in `src/lib/config.ts` |

**Access control is 4 layers** (so changes land in the right place):
1. **Toggles** — read/write access flags (`src/permissions/toggles.ts`)
2. **Native** — connector-native permission checks (`src/permissions/native.ts`)
3. **Script** — custom JS evaluation (`src/permissions/scripts.ts`)
4. **AI filter** — Claude-based response filtering, uncertain results go to the approval queue (`src/ai/filter.ts`, `src/approvals/`)

Layers 1–3 are hard checks **before** execution; Layer 4 filters the response **after** execution.

## Code conventions

- TypeScript strict mode; path alias `@/*` → `src/*`.
- **Server Components by default.** Add `"use client"` only for interactive forms/buttons.
- **Mutations go through `src/app/api/*` routes.** Client forms POST/PATCH JSON, then call `router.refresh()` to revalidate server-rendered content — no optimistic updates.
- Forms are controlled (`useState`) with HTML5 validation + inline API error banners. No form library.
- Connector credentials are encrypted at rest (`ENCRYPTION_KEY`, 64 hex chars). Never log or persist them in plaintext.

## UI component patterns

Build UI with plain elements + semantic tokens (see styling section). Shared primitives: `src/components/ui/button.tsx` (CVA variants) and `card.tsx`. Use the `cn()` helper from `src/lib/utils.ts` to merge classes.

- **Icons: use `react-icons` (Feather, `react-icons/fi`).** Migrate stray `lucide-react` usage when you touch it. Size with `h-4 w-4` / `h-5 w-5`.
- **Buttons show loading state:** `disabled={loading}` + swap the label (e.g. `{loading ? "Saving…" : "Save"}`).
- **Status badges:** `rounded-full px-2 py-0.5 text-xs font-medium` + a token class — `bg-success/10 text-success`, `bg-info/10 text-info`, `bg-destructive/10 text-destructive`, neutral `bg-muted text-muted-foreground`.
- **Alert banners:** error `rounded-md bg-destructive/10 p-3 text-sm text-destructive`; success `rounded-md bg-success/10 p-3 text-sm text-success`.
- **Empty states:** `<p className="text-sm text-muted-foreground">No … yet.</p>`.
- **Inputs:** `rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none`.
- **Typography:** page header `text-2xl font-bold`; section header `text-lg font-semibold`; secondary text `text-muted-foreground`.

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

## Verifying changes

There is **no test suite and no linter configured**. Before claiming a change is done:

- Typecheck: `bunx tsc --noEmit`
- Build: `bun run build`
- For UI changes, run `bun run dev` and verify the feature in **both light and dark mode**.
