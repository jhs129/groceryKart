# GroceryKart

Household grocery tracker: what’s on hand, what you just bought, what to shop for, and what to cook before it turns. Each household is an organization with its own isolated data, joined by invite code, so a family can share one account's worth of groceries across everyone in the house.

## Stack

- Next.js App Router on Vercel
- Neon Postgres
- Drizzle ORM
- Vercel AI Gateway for receipt photos and recipe suggestions
- A REST API (`/api/openapi.json`) and MCP server (`/api/mcp`), both behind OAuth 2.1, for other tools and agents to read/update a household's groceries

## Local setup

```bash
pnpm install
vercel link --yes --scope <team> --project grocerykart
vercel env pull .env.local --yes
pnpm db:push
pnpm db:seed
pnpm dev
```

Receipt scanning and recipe suggestions need [AI Gateway](https://vercel.com/ai-gateway) access. On Vercel that can use OIDC. Locally, add `AI_GATEWAY_API_KEY` to `.env.local`.

## What it tracks

- **On hand** inventory lots, with locations and use-by dates
- **Receipts** as a purchase history, even if the food is later eaten
- **Kart** shopping lists
- **Cook** recipes biased toward perishable food
- **Do we have** answers that distinguish inventory from “we bought this two days ago”

The app does not know if someone already used an item. It only knows what was recorded.
