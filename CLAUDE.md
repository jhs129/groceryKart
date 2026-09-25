# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

GroceryKart: a household grocery tracker (Next.js App Router + Neon Postgres + Drizzle ORM, deployed on Vercel). It tracks on-hand inventory, receipts as purchase history, shopping lists, and AI recipe suggestions biased toward perishables. See README.md for the product framing — notably, the app never knows if an item was actually used; it only knows what was recorded (purchases vs. inventory lots are deliberately separate facts).

The app is multi-tenant: users belong to organizations (households), all grocery data is scoped by `organizationId`, and an organization is joined via a join code from the onboarding flow. Besides the authenticated web UI, GroceryKart exposes a REST API (`app/api/*`, spec at `/api/openapi.json`) and an MCP server (`/api/mcp`, 16 tools) for external and agent clients, both authenticated via an OAuth 2.1 flow (`/api/oauth/register`, `/api/oauth/authorize`, `/api/oauth/token`, discovery at `/.well-known/oauth-authorization-server`).

## Commands

```bash
pnpm install
vercel link --yes --scope <team> --project grocerykart
vercel env pull .env.local --yes   # pulls DATABASE_URL (and AI_GATEWAY_API_KEY if set)
pnpm db:push                        # push schema to Neon (no migration files generated)
pnpm db:seed                        # tsx scripts/seed.ts
pnpm dev
pnpm build
pnpm lint
pnpm db:generate                    # generate drizzle migration files (drizzle-kit generate)
pnpm db:studio                      # drizzle-kit studio
```

There is no test runner configured in this repo.

Receipt scanning and recipe suggestions require Vercel AI Gateway access. On Vercel this can use OIDC; locally set `AI_GATEWAY_API_KEY` in `.env.local`.

## Architecture

- **Data flow is server-actions-first for the web UI.** All mutations from the browser live in `app/actions/*.ts` (`"use server"`), calling Drizzle directly against `lib/db`. Pages are server components; interactive pieces are client components in `components/` that call the server actions directly (form actions or direct calls) and rely on `revalidatePath` for freshness (no client-side cache invalidation library). For external/agent clients there is a separate route-handler layer under `app/api/*` — a REST API (documented by the OpenAPI spec at `/api/openapi.json`, kept in sync via `scripts/verify-openapi-drift.ts`) and an MCP server at `/api/mcp` — both authenticated with OAuth 2.1 bearer tokens (`app/api/oauth/*`) rather than the browser session cookie; both call into the same `lib/domain/*` functions as the server actions.
- **Schema (`lib/db/schema.ts`) models purchase history and current inventory as distinct, only loosely coupled concepts**, per the product's core premise. Every grocery-data table carries an `organizationId` so households are fully isolated from one another:
  - `organizations` / `organizationMembers` — a household and its members (`owner`/`member` roles), joined via a per-organization join code.
  - `items` — canonical catalog, deduped via `normalizedName` (unique per organization) with an `aliases` jsonb array.
  - `purchases` — an append-only fact log of what was bought (from manual add or receipt confirm). Never mutated after insert.
  - `inventoryLots` — the current belief of what's on hand, with `status` (`on_hand` / `used_up` / `discarded`) and `expiresAt`. Mutated as lots are adjusted or marked gone.
  - `receipts` + `receiptLines` — a receipt's raw parse, linked to the `items` it resolved to; `receiptLines.addedToInventory` records whether confirming the receipt also created an `inventoryLots` row.
  - `shoppingLists` + `shoppingListItems`, `recipes` + `recipeIngredients` round out the rest.
  - When adding a feature that touches "what we have," decide explicitly whether it belongs in `purchases` (immutable history) or `inventoryLots` (current, mutable state) — most features touch both via `findOrCreateItem`.
- **Item resolution is centralized in `lib/matching.ts`.** `findOrCreateItem`/`findMatchingItem` normalize free-text names (`normalizeName` strips filler words like "organic", "large", "pk") and fuzzy-match against existing `items` before creating a new one. Any code turning a raw string (receipt line, manual entry, recipe ingredient) into an `itemId` should go through this, not ad hoc queries.
- **AI calls are centralized in `lib/ai.ts`** using the `ai` SDK's `generateObject` against Vercel AI Gateway model strings (e.g. `google/gemini-3.5-flash` for vision, `openai/gpt-5.4-mini` for text) with Zod schemas. Three flows: `extractReceipt` (photo → structured line items), `suggestRecipesFromInventory`, `answerInventoryQuestion` (the "do we have X" flow, which explicitly reasons over inventory vs. recent purchases rather than claiming certainty).
- **Shared vocabularies** (`CATEGORIES`, `LOCATIONS`, `UNITS`, `LOT_STATUSES`) live in `lib/types.ts` and are reused across the DB schema, AI schemas, and forms — extend there first when adding a new category/location/unit rather than inlining string literals.
- `next.config.ts` enables `reactCompiler` and raises server action body size to 8mb (needed for receipt photo uploads via `FormData`).
