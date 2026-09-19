# Organizations, OAuth 2.1, REST API, and MCP server

Date: 2026-09-19

## Context

GroceryKart currently has no user/account model — it's a single-household
app where every table implicitly belongs to "the household." All mutations
live in `app/actions/*.ts` server actions calling Drizzle directly; all reads
live in `lib/db/queries.ts`.

The goal: let multiple households ("organizations") use the same deployment,
each with their own isolated data, multiple invited members, real user
accounts, and — for programmatic/AI access — a REST API and an MCP server
protected by a real OAuth 2.1 authorization server, mirroring the shape of
`~/dev/bigearnie`'s implementation but scoped down for an app with a much
simpler permission model (no custom RBAC, no billing tiers, one shared
inventory per organization).

## Scope decisions (confirmed)

- **Roles**: fixed two-role model per organization — `owner` and `member`.
  No custom roles, no permission-string system. Owners can manage
  membership (invite, remove, rotate join code, rename org); members have
  full read/write on all organization data.
- **Invitation**: shareable join code / `/join/<code>` link, generated and
  shared out-of-band by the owner (text, email, whatever). No transactional
  email sending in this app.
- **Login**: NextAuth v5, Credentials provider (email + password) and
  Google provider, using `@auth/drizzle-adapter` (this app uses Drizzle,
  not Prisma).
- **Auth for REST/MCP**: a real OAuth 2.1 authorization server (dynamic
  client registration, PKCE, JWT access/refresh tokens) that this same app
  both issues and verifies. No JWKS/RS256 needed — HS256 with a server
  secret is sufficient since there's no third-party verifier.
- **Refactor**: extract `app/actions/*.ts` logic into plain, typed
  functions in `lib/domain/*.ts` that take a `Caller` and typed args. Server
  actions, REST routes, and MCP tools all call these same functions.

## Data model changes

New tables in `lib/db/schema.ts`:

```
users
  id            uuid pk
  email         text unique
  passwordHash  text nullable   -- null for Google-only accounts
  name          text
  image         text nullable
  activeOrganizationId  uuid nullable references organizations.id
  createdAt     timestamp

organizations
  id            uuid pk
  name          text
  joinCode      text unique     -- rotatable
  createdAt     timestamp

organizationMembers
  id            uuid pk
  userId        uuid references users.id
  organizationId uuid references organizations.id
  role          text  -- "owner" | "member"
  createdAt     timestamp
  -- unique(userId, organizationId)
```

Plus the NextAuth adapter tables (`accounts`, `sessions`, `verificationTokens`)
per `@auth/drizzle-adapter`'s standard schema.

Existing tables gain an `organizationId` column (not nullable, FK to
`organizations.id`): `items`, `receipts`, `inventoryLots`, `purchases`,
`shoppingLists`, `recipes`. Child tables (`receiptLines`, `recipeIngredients`,
`shoppingListItems`) inherit scope through their parent FK and need no new
column. `items.normalizedName`'s unique constraint changes from global to
`unique(organizationId, normalizedName)`.

Every query in `lib/db/queries.ts` and every mutation in the new
`lib/domain/*.ts` functions takes/filters by `organizationId`.

## Auth flow

- Sign-up: after Credentials or Google auth completes, if the user has no
  organization, show a choice screen — "Create an organization" (name only,
  becomes `owner`) or "Join an organization" (enter join code, becomes
  `member`). This mirrors bigearnie's registration split without the
  SSO-intent-cookie machinery, since both paths land on the same
  post-auth choice screen.
- Session JWT carries `userId` and `activeOrganizationId`.
- A user can belong to multiple organizations (e.g. invited to a second
  household). Switching: `POST /api/organizations/switch` sets
  `users.activeOrganizationId`; client calls NextAuth's `update()` to
  refresh JWT claims.
- Owner-only actions (`requireOwner(caller)` guard, no permission strings):
  rename organization, rotate join code, remove a member.
- Any member: view current join code, leave organization.

## Domain layer refactor

`app/actions/{inventory,lists,receipts,recipes,ask}.ts` logic moves into
`lib/domain/{inventory,lists,receipts,recipes,ask}.ts` as plain functions:

```ts
type Caller = { userId: string; organizationId: string; role: "owner" | "member" };

async function addInventoryItem(caller: Caller, input: { name: string; quantity: number; ... })
```

Server actions become thin adapters: resolve `Caller` from the NextAuth
session, parse `FormData` into typed input, call the domain function, then
`revalidatePath`. REST routes and MCP tools resolve `Caller` from an OAuth
bearer token instead, and call the identical domain functions.

## REST API

`app/api/**` route handlers, one per domain function and per read query in
`lib/db/queries.ts`. Documented via a hand-written OpenAPI 3.1 spec served
at `/api/openapi.json` (bigearnie's pattern) with a drift-guard check that
every documented path has a matching `route.ts`. Auth: `Authorization: Bearer
<access_token>` issued by this app's own OAuth server — no separate
API-key scheme.

## MCP server

`app/api/mcp/route.ts` using `mcp-handler` + `@modelcontextprotocol/sdk`.
One registered tool per domain function (mutations) and per read query
(reads), each taking the same typed input as its REST counterpart. Auth via
`withMcpAuth` verifying the same bearer tokens. `tools/list` is not
caller-customized (no per-tool capability gating beyond owner-only tools
checking `caller.role` inside the handler, same as REST).

## OAuth 2.1 authorization server

New `lib/oauth/` + `app/api/oauth/` + `app/.well-known/`:

- `POST /api/oauth/register` — dynamic client registration (RFC 7591):
  accepts `client_name`, `redirect_uris`; returns `client_id` (no secret
  needed for public/PKCE clients).
- `GET/POST /api/oauth/authorize` — requires an active NextAuth session.
  Requires PKCE (`code_challenge`, `S256`). Presents a consent screen: "Allow
  `<client_name>` to access `<active organization name>` on your behalf?"
  Issues a short-lived auth code bound to `{userId, organizationId,
  clientId, codeChallenge}`.
- `POST /api/oauth/token` — exchanges auth code + `code_verifier` (or a
  refresh token) for a JWT access token + refresh token. Access token
  payload: `{userId, organizationId, scope, exp}`, HS256-signed with an env
  secret (`OAUTH_SIGNING_SECRET`). No JWKS endpoint — this app is both
  issuer and sole verifier.
- `GET /.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource` — RFC 8414 / RFC 9728 discovery
  metadata, so MCP clients (Claude, MCP Inspector) can auto-configure
  against `/api/mcp` and `/api/oauth/*`.

New dependencies: `next-auth@beta` (v5), `@auth/drizzle-adapter`, `bcrypt`,
`@modelcontextprotocol/sdk`, `mcp-handler`, `jose` (JWT sign/verify).

## Error handling

Domain functions throw typed errors (`NotFoundError`, `ForbiddenError`,
`ValidationError`) — a small local set, not bigearnie's full hierarchy.
REST routes map these to HTTP status codes (404/403/400); MCP tool handlers
map them to MCP tool-error results. `requireOwner`/organization-membership
checks throw `ForbiddenError` uniformly whether called from a server
action, REST route, or MCP tool.

## Testing

No test runner exists in this repo yet. Manual verification: sign up two
separate accounts creating two organizations, confirm data isolation (an
item added in org A never appears in org B's queries); join the second
account into org A via join code and confirm it now sees org A's data;
exercise the OAuth flow end-to-end with MCP Inspector (register a client,
complete `/authorize` with PKCE, call an MCP tool) against a locally
running dev server.

## Out of scope

- Transactional email (invitations are link/code-only).
- Custom roles/permissions beyond owner/member.
- JWKS/RS256, third-party token verification.
- Billing, subscription tiers, multi-org admin UI beyond a simple switcher.
- Migrating existing seed data — the existing dev DB has no organizationId
  data; a fresh `db:push` + reseed is expected during implementation.
