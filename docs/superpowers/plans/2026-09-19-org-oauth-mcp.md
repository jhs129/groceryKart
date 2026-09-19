# Organizations, OAuth 2.1, REST API, and MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn GroceryKart from a single-household app into a multi-organization app with real accounts, org invites via join code, a REST API, and an MCP server, both protected by a self-hosted OAuth 2.1 authorization server.

**Architecture:** Add `users`/`organizations`/`organizationMembers` tables and an `organizationId` column on every household-data table. Extract all business logic from `app/actions/*.ts` into plain `lib/domain/*.ts` functions taking a `Caller` (`{userId, organizationId, role}`). Server actions, new REST route handlers, and new MCP tools all call the same domain functions — the only difference is how each resolves a `Caller` (NextAuth session cookie vs. OAuth bearer token).

**Tech Stack:** Next.js App Router, Drizzle ORM, Neon Postgres, NextAuth v5 (`next-auth@beta`) with `@auth/drizzle-adapter`, `bcryptjs` for password hashing, `jose` for JWT signing/verification, `@modelcontextprotocol/sdk` + `mcp-handler` for the MCP endpoint, Zod for input validation.

**Spec:** `docs/superpowers/specs/2026-09-19-org-oauth-mcp-design.md`

## Global Constraints

- Package manager is pnpm exclusively — every install/run command uses `pnpm`.
- This Next.js version has breaking changes from training-data assumptions (per `AGENTS.md`). Before writing any new `route.ts` file, read the relevant guide under `node_modules/next/dist/docs/` (e.g. route handlers, dynamic APIs) and heed deprecation notices — in particular check whether route params/cookies/headers must be awaited in this version.
- No test runner is configured in this repo. "Testing" a task means either (a) a `tsx scripts/verify-*.ts` throwaway script that exercises the new function directly against the dev database and prints pass/fail, or (b) manual `curl`/browser verification against `pnpm dev`, as specified per task. Delete throwaway verification scripts after confirming they pass, unless a task says to keep one.
- After every task, run `pnpm build` and `pnpm lint` and fix any errors before committing (per project-wide rule).
- Any new interface/type must be written out in full, simple field lists — never `Omit<...>`, `NonNullable<...>`, or other composed/derived type notation.
- Any new component file that ends up over 100 lines must be split into a directory named after the component, with the component and its `Props` interface in `index.tsx`.
- Never use `Math.random()` for anything that renders — it causes hydration mismatches. Use `crypto.randomUUID()` (or a DB-generated id) for join codes instead.
- Commit after each task with a message describing that task's change.

---

## Task inventory (file map)

New files this plan creates, grouped by concern:

- **Schema**: `lib/db/schema.ts` (modified — new tables + columns)
- **Domain errors/caller**: `lib/domain/errors.ts`, `lib/domain/caller.ts`
- **Auth**: `lib/auth.ts`, `lib/auth.config.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx`, `app/(auth)/onboarding/page.tsx`, `app/actions/auth.ts`
- **Organizations domain**: `lib/domain/organizations.ts`, `app/settings/page.tsx`, `app/actions/organizations.ts`
- **Matching scoping**: `lib/matching.ts` (modified)
- **Queries scoping**: `lib/db/queries.ts` (modified)
- **Domain refactor**: `lib/domain/inventory.ts`, `lib/domain/lists.ts`, `lib/domain/receipts.ts`, `lib/domain/recipes.ts`, `lib/domain/ask.ts`; `app/actions/inventory.ts`, `app/actions/lists.ts`, `app/actions/receipts.ts`, `app/actions/recipes.ts`, `app/actions/ask.ts` (all modified to thin wrappers)
- **OAuth server**: `lib/oauth/jwt.ts`, `lib/oauth/pkce.ts`, `lib/oauth/clients.ts`, `lib/oauth/codes.ts`, `app/api/oauth/register/route.ts`, `app/api/oauth/authorize/page.tsx`, `app/api/oauth/authorize/route.ts`, `app/api/oauth/token/route.ts`, `app/.well-known/oauth-authorization-server/route.ts`, `app/.well-known/oauth-protected-resource/route.ts`
- **REST API**: `lib/api/respond.ts`, `lib/api/auth.ts`, `app/api/inventory/route.ts`, `app/api/inventory/[lotId]/route.ts`, `app/api/lists/route.ts`, `app/api/lists/[listId]/route.ts`, `app/api/lists/[listId]/items/route.ts`, `app/api/receipts/route.ts`, `app/api/receipts/[receiptId]/route.ts`, `app/api/recipes/route.ts`, `app/api/ask/route.ts`, `app/api/openapi.json/route.ts`
- **MCP**: `lib/mcp/auth.ts`, `lib/mcp/tools.ts`, `app/api/mcp/route.ts`

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `next-auth`, `@auth/drizzle-adapter`, `bcryptjs`, `@types/bcryptjs`, `jose`, `@modelcontextprotocol/sdk`, `mcp-handler` available as imports for all later tasks.

- [ ] **Step 1: Install packages**

Run:
```bash
pnpm add next-auth@beta @auth/drizzle-adapter bcryptjs jose @modelcontextprotocol/sdk mcp-handler
pnpm add -D @types/bcryptjs
```

- [ ] **Step 2: Verify install**

Run: `pnpm build`
Expected: build still succeeds (no code uses the new packages yet, so this only confirms the install didn't break anything).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add auth, oauth, and mcp dependencies"
```

---

### Task 2: Schema — users, organizations, organizationMembers, org-scoping columns

**Files:**
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Produces:
  - `users` table: `id, email, passwordHash, name, image, activeOrganizationId, createdAt`
  - `organizations` table: `id, name, joinCode, createdAt`
  - `organizationMembers` table: `id, userId, organizationId, role ("owner"|"member"), createdAt`
  - NextAuth adapter tables: `accounts`, `sessions`, `verificationTokens` (exact shape required by `@auth/drizzle-adapter`)
  - `organizationId` column (uuid, not null, FK → `organizations.id`, `onDelete: "cascade"`) added to: `items`, `receipts`, `inventoryLots`, `purchases`, `shoppingLists`, `recipes`.
  - `items.normalizedName` unique constraint changes from a plain unique column to a composite unique index on `(organizationId, normalizedName)`.
- Consumes: nothing (first schema change).

- [ ] **Step 1: Add user/org/member/auth tables**

Add to `lib/db/schema.ts`, above the existing `items` table:

```ts
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  image: text("image"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  activeOrganizationId: uuid("active_organization_id").references(
    () => organizations.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("org_members_user_idx").on(table.userId),
    index("org_members_org_idx").on(table.organizationId),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    index("accounts_provider_idx").on(table.provider, table.providerAccountId),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").notNull().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [index("verification_tokens_identifier_idx").on(table.identifier)],
);
```

- [ ] **Step 2: Add `organizationId` to household-data tables**

In `lib/db/schema.ts`, add this field to each of `items`, `receipts`, `inventoryLots`, `purchases`, `shoppingLists`, `recipes` (placed right after each table's `id` field):

```ts
organizationId: uuid("organization_id")
  .notNull()
  .references(() => organizations.id, { onDelete: "cascade" }),
```

- [ ] **Step 3: Change `items.normalizedName` to a composite unique index**

In the `items` table definition, remove `.unique()` from the `normalizedName` column:

```ts
normalizedName: text("normalized_name").notNull(),
```

Add a composite unique index in the `items` table's index array (alongside the existing `items_category_idx`):

```ts
uniqueIndex("items_org_normalized_name_idx").on(table.organizationId, table.normalizedName),
```

Add `uniqueIndex` to the `drizzle-orm/pg-core` import at the top of the file.

- [ ] **Step 4: Add relations for the new tables**

Append to `lib/db/schema.ts`:

```ts
export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(organizationMembers),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
}));
```

- [ ] **Step 5: Push schema and verify**

Run: `pnpm db:push`
Expected: Drizzle Kit reports the new tables and columns being created. Since the existing `items`/`receipts`/etc. tables have a new `NOT NULL` `organizationId` column with no default and existing dev data has none, accept Drizzle Kit's prompt to truncate/reset those tables if prompted (per spec's "Out of scope: migrating existing seed data" — a fresh reseed is expected). If drizzle-kit refuses due to existing rows, run `pnpm db:studio`, manually delete all rows from `items`, `receipts`, `receipt_lines`, `inventory_lots`, `purchases`, `shopping_lists`, `shopping_list_items`, `recipes`, `recipe_ingredients`, then re-run `pnpm db:push`.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: add organizations, users, and organization-scoping columns"
```

---

### Task 3: Domain errors and Caller type

**Files:**
- Create: `lib/domain/errors.ts`
- Create: `lib/domain/caller.ts`

**Interfaces:**
- Produces:
  - `class NotFoundError extends Error`
  - `class ForbiddenError extends Error`
  - `class ValidationError extends Error`
  - `type Caller = { userId: string; organizationId: string; role: "owner" | "member" }`
  - `function requireOwner(caller: Caller): void` — throws `ForbiddenError` if `caller.role !== "owner"`
- Consumes: nothing.

- [ ] **Step 1: Write error classes**

Create `lib/domain/errors.ts`:

```ts
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
```

- [ ] **Step 2: Write the Caller type and guard**

Create `lib/domain/caller.ts`:

```ts
import { ForbiddenError } from "./errors";

export interface Caller {
  userId: string;
  organizationId: string;
  role: "owner" | "member";
}

export function requireOwner(caller: Caller) {
  if (caller.role !== "owner") {
    throw new ForbiddenError("Only the organization owner can do this.");
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm build`
Expected: succeeds (these files aren't imported anywhere yet, but TypeScript still type-checks them).

- [ ] **Step 4: Commit**

```bash
git add lib/domain/errors.ts lib/domain/caller.ts
git commit -m "feat: add domain error types and Caller interface"
```

---

### Task 4: Organizations domain functions

**Files:**
- Create: `lib/domain/organizations.ts`

**Interfaces:**
- Consumes: `Caller`, `requireOwner` from `lib/domain/caller.ts`; `NotFoundError`, `ForbiddenError` from `lib/domain/errors.ts`; `db` from `lib/db`; `organizations`, `organizationMembers`, `users` from `lib/db/schema`.
- Produces:
  - `createOrganization(userId: string, name: string): Promise<{ id: string; name: string; joinCode: string }>`
  - `joinOrganizationByCode(userId: string, joinCode: string): Promise<{ id: string; name: string }>`
  - `switchActiveOrganization(userId: string, organizationId: string): Promise<void>`
  - `rotateJoinCode(caller: Caller): Promise<{ joinCode: string }>`
  - `renameOrganization(caller: Caller, name: string): Promise<void>`
  - `listMembers(caller: Caller): Promise<{ userId: string; name: string | null; email: string; role: string }[]>`
  - `removeMember(caller: Caller, targetUserId: string): Promise<void>`
  - `leaveOrganization(caller: Caller): Promise<void>`
  - `getOrganizationForUser(userId: string, organizationId: string): Promise<{ organizationId: string; role: "owner" | "member" } | null>` — used to build a `Caller` from a session.

- [ ] **Step 1: Write join-code generator and organization creation**

Create `lib/domain/organizations.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationMembers, organizations, users } from "@/lib/db/schema";
import { ForbiddenError, NotFoundError } from "./errors";
import { requireOwner, type Caller } from "./caller";

function generateJoinCode() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

export async function createOrganization(userId: string, name: string) {
  const trimmedName = name.trim() || "My organization";
  const [organization] = await db
    .insert(organizations)
    .values({ name: trimmedName, joinCode: generateJoinCode() })
    .returning();

  await db.insert(organizationMembers).values({
    userId,
    organizationId: organization.id,
    role: "owner",
  });

  await db
    .update(users)
    .set({ activeOrganizationId: organization.id })
    .where(eq(users.id, userId));

  return organization;
}

export async function joinOrganizationByCode(userId: string, joinCode: string) {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.joinCode, joinCode.trim().toUpperCase()),
  });
  if (!organization) {
    throw new NotFoundError("No organization matches that join code.");
  }

  const existing = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.organizationId, organization.id),
    ),
  });
  if (!existing) {
    await db.insert(organizationMembers).values({
      userId,
      organizationId: organization.id,
      role: "member",
    });
  }

  await db
    .update(users)
    .set({ activeOrganizationId: organization.id })
    .where(eq(users.id, userId));

  return { id: organization.id, name: organization.name };
}

export async function getOrganizationForUser(userId: string, organizationId: string) {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.organizationId, organizationId),
    ),
  });
  if (!membership) return null;
  return { organizationId, role: membership.role as "owner" | "member" };
}
```

- [ ] **Step 2: Write switch/rotate/rename/member management functions**

Append to `lib/domain/organizations.ts`:

```ts
export async function switchActiveOrganization(userId: string, organizationId: string) {
  const membership = await getOrganizationForUser(userId, organizationId);
  if (!membership) {
    throw new ForbiddenError("You are not a member of that organization.");
  }
  await db
    .update(users)
    .set({ activeOrganizationId: organizationId })
    .where(eq(users.id, userId));
}

export async function rotateJoinCode(caller: Caller) {
  requireOwner(caller);
  const joinCode = generateJoinCode();
  await db
    .update(organizations)
    .set({ joinCode })
    .where(eq(organizations.id, caller.organizationId));
  return { joinCode };
}

export async function renameOrganization(caller: Caller, name: string) {
  requireOwner(caller);
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Organization name cannot be empty.");
  }
  await db
    .update(organizations)
    .set({ name: trimmedName })
    .where(eq(organizations.id, caller.organizationId));
}

export async function listMembers(caller: Caller) {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, caller.organizationId));
  return rows;
}

export async function removeMember(caller: Caller, targetUserId: string) {
  requireOwner(caller);
  if (targetUserId === caller.userId) {
    throw new ForbiddenError("Use leaveOrganization to remove yourself.");
  }
  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, targetUserId),
        eq(organizationMembers.organizationId, caller.organizationId),
      ),
    );
}

export async function leaveOrganization(caller: Caller) {
  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, caller.userId),
        eq(organizationMembers.organizationId, caller.organizationId),
      ),
    );
  await db
    .update(users)
    .set({ activeOrganizationId: null })
    .where(eq(users.id, caller.userId));
}
```

- [ ] **Step 3: Verify with a throwaway script**

Create `/private/tmp/claude-501/verify-orgs.ts` is NOT correct — instead create it inside the scratchpad directory the executing agent is given, or under `scripts/` and delete after. Create `scripts/verify-orgs.ts` temporarily:

```ts
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { users } from "../lib/db/schema";
import { createOrganization, joinOrganizationByCode, getOrganizationForUser } from "../lib/domain/organizations";

async function main() {
  const [owner] = await db.insert(users).values({ email: `owner-${randomUUID()}@test.local` }).returning();
  const [member] = await db.insert(users).values({ email: `member-${randomUUID()}@test.local` }).returning();

  const org = await createOrganization(owner.id, "Test Household");
  console.log("created org", org.id, org.joinCode);

  const joined = await joinOrganizationByCode(member.id, org.joinCode);
  console.log("joined", joined.id === org.id ? "PASS" : "FAIL");

  const ownerMembership = await getOrganizationForUser(owner.id, org.id);
  const memberMembership = await getOrganizationForUser(member.id, org.id);
  console.log("owner role", ownerMembership?.role === "owner" ? "PASS" : "FAIL");
  console.log("member role", memberMembership?.role === "member" ? "PASS" : "FAIL");
  process.exit(0);
}

main();
```

Run: `pnpm tsx scripts/verify-orgs.ts`
Expected: prints `created org ...`, then three `PASS` lines.

- [ ] **Step 4: Delete the throwaway script**

```bash
rm scripts/verify-orgs.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/domain/organizations.ts
git commit -m "feat: add organization domain functions"
```

---

### Task 5: NextAuth configuration (Credentials + Google, Drizzle adapter)

**Files:**
- Create: `lib/auth.config.ts`
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Modify: `.env.local` is NOT modified by the agent (secrets) — instead create `.env.example` entries.
- Modify: `.env.example` (create if it doesn't exist)

**Interfaces:**
- Consumes: `db` from `lib/db`, `users`/`accounts`/`sessions`/`verificationTokens` from `lib/db/schema`, `getOrganizationForUser` from `lib/domain/organizations.ts`.
- Produces:
  - `auth`, `signIn`, `signOut`, `handlers` exported from `lib/auth.ts` (NextAuth v5's single `NextAuth(config)` call return value).
  - Session shape available to callers: `session.user.id: string`, `session.user.activeOrganizationId: string | null`, `session.user.role: "owner" | "member" | null`.

- [ ] **Step 1: Read NextAuth's App Router docs for this Next.js version**

Before writing code, check `node_modules/next/dist/docs/` for any route-handler or cookies/headers API changes that affect NextAuth's catch-all route handler pattern (per Global Constraints). Note any required adjustments (e.g., awaited `params`) and apply them in Step 3 below.

- [ ] **Step 2: Write the providers config**

Create `lib/auth.config.ts`:

```ts
import bcrypt from "bcryptjs";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  pages: {
    signIn: "/sign-in",
  },
};
```

- [ ] **Step 3: Wire the adapter and session callback**

Create `lib/auth.ts`:

```ts
import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { authConfig } from "@/lib/auth.config";
import { getOrganizationForUser } from "@/lib/domain/organizations";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.userId = user.id;
      }
      if (trigger === "update" || !("activeOrganizationId" in token)) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, token.userId as string),
        });
        token.activeOrganizationId = dbUser?.activeOrganizationId ?? null;
        if (token.activeOrganizationId) {
          const membership = await getOrganizationForUser(
            token.userId as string,
            token.activeOrganizationId as string,
          );
          token.role = membership?.role ?? null;
        } else {
          token.role = null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.activeOrganizationId = (token.activeOrganizationId as string | null) ?? null;
      session.user.role = (token.role as "owner" | "member" | null) ?? null;
      return session;
    },
  },
});
```

- [ ] **Step 4: Add the catch-all route handler**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

Apply any adjustment identified in Step 1 (e.g. if this Next.js version requires `params` to be awaited in route handlers generally — this route has no dynamic segments consumed directly, so it likely needs no change, but confirm).

- [ ] **Step 5: Document required env vars**

Create or update `.env.example`, adding:

```
AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Tell the user (in the task's final report, not in this file) that they must set `AUTH_SECRET` (e.g. `openssl rand -base64 32`) and Google OAuth credentials in `.env.local` / Vercel env before sign-in works end-to-end. Google sign-in can be left unset for now; Credentials sign-in only needs `AUTH_SECRET`.

- [ ] **Step 6: Verify build**

Run: `pnpm build`
Expected: succeeds. (Runtime sign-in verification happens in Task 6 once there's a UI to drive it.)

- [ ] **Step 7: Commit**

```bash
git add lib/auth.config.ts lib/auth.ts app/api/auth .env.example
git commit -m "feat: configure NextAuth with credentials and Google providers"
```

---

### Task 6: Sign-up, sign-in, and onboarding UI

**Files:**
- Create: `app/actions/auth.ts`
- Create: `app/(auth)/sign-up/page.tsx`
- Create: `app/(auth)/sign-in/page.tsx`
- Create: `app/(auth)/onboarding/page.tsx`
- Create: `app/(auth)/onboarding/actions.ts`

**Interfaces:**
- Consumes: `auth`, `signIn` from `lib/auth.ts`; `createOrganization`, `joinOrganizationByCode` from `lib/domain/organizations.ts`; `db`, `users` for direct signup insert.
- Produces: `registerUser(formData: FormData): Promise<{ error?: string }>` in `app/actions/auth.ts`, used by the sign-up page.

- [ ] **Step 1: Write the registration server action**

Create `app/actions/auth.ts`:

```ts
"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { signIn } from "@/lib/auth";

export async function registerUser(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim() || null;

  if (!email || password.length < 8) {
    return { error: "Enter an email and a password of at least 8 characters." };
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({ email, passwordHash, name });

  await signIn("credentials", { email, password, redirectTo: "/onboarding" });
}
```

- [ ] **Step 2: Write the sign-up page**

Create `app/(auth)/sign-up/page.tsx`:

```tsx
import { registerUser } from "@/app/actions/auth";

export default function SignUpPage() {
  return (
    <main className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-semibold">Create an account</h1>
      <form action={registerUser} className="space-y-3">
        <input name="name" placeholder="Name" className="w-full rounded border p-2" />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full rounded border p-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password (8+ characters)"
          required
          minLength={8}
          className="w-full rounded border p-2"
        />
        <button type="submit" className="w-full rounded bg-black p-2 text-white">
          Sign up
        </button>
      </form>
      <a href="/sign-in" className="block text-sm underline">
        Already have an account? Sign in
      </a>
    </main>
  );
}
```

- [ ] **Step 3: Write the sign-in page**

Create `app/(auth)/sign-in/page.tsx`:

```tsx
import { signIn } from "@/lib/auth";

export default function SignInPage() {
  return (
    <main className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <form
        action={async (formData) => {
          "use server";
          await signIn("credentials", {
            email: formData.get("email"),
            password: formData.get("password"),
            redirectTo: "/",
          });
        }}
        className="space-y-3"
      >
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full rounded border p-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="w-full rounded border p-2"
        />
        <button type="submit" className="w-full rounded bg-black p-2 text-white">
          Sign in
        </button>
      </form>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button type="submit" className="w-full rounded border p-2">
          Sign in with Google
        </button>
      </form>
      <a href="/sign-up" className="block text-sm underline">
        Need an account? Sign up
      </a>
    </main>
  );
}
```

- [ ] **Step 4: Write onboarding (create vs join organization)**

Create `app/(auth)/onboarding/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { auth, unstable_update } from "@/lib/auth";
import { createOrganization, joinOrganizationByCode } from "@/lib/domain/organizations";

export async function createOrganizationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const name = String(formData.get("name") ?? "");
  await createOrganization(session.user.id, name);
  redirect("/");
}

export async function joinOrganizationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const joinCode = String(formData.get("joinCode") ?? "");
  await joinOrganizationByCode(session.user.id, joinCode);
  redirect("/");
}
```

If `unstable_update` is not exported by the installed `next-auth` version (check `node_modules/next-auth/index.d.ts`), remove that import — the JWT callback in `lib/auth.ts` already re-reads `activeOrganizationId` from the database on the next request when the `jwt` trigger is `"update"`, but since these actions redirect to `/` (a fresh request), the session cookie's stale JWT would still show no `activeOrganizationId` until the client calls `update()`. To avoid needing client-side `update()` here, change `redirect("/")` to `redirect("/api/auth/session?update=1")` is NOT valid either — instead, simplest fix: after creating/joining, force a session refresh by redirecting to a page that calls the client hook. Since onboarding's form is a plain server action already causing a full navigation, and NextAuth v5's JWT callback reruns on every request, confirm during Step 6 testing whether the new `activeOrganizationId` shows up on `/` immediately; if not, add a client component `app/(auth)/onboarding/RedirectAfterAuth.tsx` that calls `await fetch("/api/auth/session?update")` then `router.refresh()` — implement this fallback only if Step 6 shows it's needed.

Create `app/(auth)/onboarding/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createOrganizationAction, joinOrganizationAction } from "./actions";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  if (session.user.activeOrganizationId) redirect("/");

  return (
    <main className="mx-auto max-w-sm space-y-6 p-6">
      <h1 className="text-xl font-semibold">Set up your household</h1>
      <form action={createOrganizationAction} className="space-y-3">
        <input name="name" placeholder="Household name" required className="w-full rounded border p-2" />
        <button type="submit" className="w-full rounded bg-black p-2 text-white">
          Create a new organization
        </button>
      </form>
      <div className="text-center text-sm text-gray-500">or</div>
      <form action={joinOrganizationAction} className="space-y-3">
        <input name="joinCode" placeholder="Join code" required className="w-full rounded border p-2" />
        <button type="submit" className="w-full rounded border p-2">
          Join an existing organization
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: succeeds. Fix any TypeScript errors from the `session.user.id`/`activeOrganizationId`/`role` fields not being declared on NextAuth's `Session` type — if so, add a module augmentation file `types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      activeOrganizationId: string | null;
      role: "owner" | "member" | null;
    } & DefaultSession["user"];
  }
}
```

- [ ] **Step 6: Manual verification**

Run `pnpm dev`, then in a browser:
1. Go to `/sign-up`, create an account. Confirm redirect to `/onboarding`.
2. Create an organization. Confirm redirect to `/` and that `session.user.activeOrganizationId` is populated — check by temporarily adding `console.log(await auth())` to `app/page.tsx` server component, or by inspecting the JWT cookie's decoded payload via `pnpm dev` server logs. Remove any temporary debug logging afterward.
3. Sign out (add a temporary `<form action={async () => { "use server"; await signOut(); }}>` button anywhere, or call `/api/auth/signout` directly), sign up a second account, and join the first account's organization via its join code (visible via the debug log from step 2, or query `organizations` in `pnpm db:studio`). Confirm the second user's membership row and `activeOrganizationId` are correct in `pnpm db:studio`.

If step 2 shows `activeOrganizationId` is stale (null) right after onboarding, implement the client-refresh fallback described in Step 4 and re-verify.

- [ ] **Step 7: Commit**

```bash
git add app/actions/auth.ts "app/(auth)" types/next-auth.d.ts
git commit -m "feat: add sign-up, sign-in, and organization onboarding UI"
```

---

### Task 7: Organization settings UI (members, join code, rename)

**Files:**
- Create: `app/actions/organizations.ts`
- Create: `app/settings/page.tsx`

**Interfaces:**
- Consumes: `auth` from `lib/auth.ts`; `listMembers`, `rotateJoinCode`, `renameOrganization`, `removeMember`, `leaveOrganization` from `lib/domain/organizations.ts`; `Caller` from `lib/domain/caller.ts`.
- Produces: a `resolveCaller()` helper (in `app/actions/organizations.ts`) reused by every later `app/actions/*.ts` refactor task — signature: `async function resolveCaller(): Promise<Caller>` — redirects to `/sign-in` or `/onboarding` if there's no session or no active organization.

- [ ] **Step 1: Write the `resolveCaller` helper and organization actions**

Create `app/actions/organizations.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import type { Caller } from "@/lib/domain/caller";
import {
  listMembers,
  removeMember,
  renameOrganization,
  rotateJoinCode,
  leaveOrganization,
} from "@/lib/domain/organizations";

export async function resolveCaller(): Promise<Caller> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  if (!session.user.activeOrganizationId || !session.user.role) redirect("/onboarding");
  return {
    userId: session.user.id,
    organizationId: session.user.activeOrganizationId,
    role: session.user.role,
  };
}

export async function rotateJoinCodeAction() {
  const caller = await resolveCaller();
  const result = await rotateJoinCode(caller);
  revalidatePath("/settings");
  return result;
}

export async function renameOrganizationAction(formData: FormData) {
  const caller = await resolveCaller();
  await renameOrganization(caller, String(formData.get("name") ?? ""));
  revalidatePath("/settings");
}

export async function removeMemberAction(formData: FormData) {
  const caller = await resolveCaller();
  await removeMember(caller, String(formData.get("userId") ?? ""));
  revalidatePath("/settings");
}

export async function leaveOrganizationAction() {
  const caller = await resolveCaller();
  await leaveOrganization(caller);
  redirect("/onboarding");
}

export async function loadMembers() {
  const caller = await resolveCaller();
  return listMembers(caller);
}
```

- [ ] **Step 2: Write the settings page**

Create `app/settings/page.tsx`:

```tsx
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  resolveCaller,
  loadMembers,
  renameOrganizationAction,
  removeMemberAction,
  rotateJoinCodeAction,
  leaveOrganizationAction,
} from "@/app/actions/organizations";

export default async function SettingsPage() {
  const caller = await resolveCaller();
  const [org, members] = await Promise.all([
    db.query.organizations.findFirst({ where: eq(organizations.id, caller.organizationId) }),
    loadMembers(),
  ]);

  return (
    <main className="mx-auto max-w-xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">Organization settings</h1>

      <section className="space-y-2">
        <h2 className="font-medium">Name</h2>
        <form action={renameOrganizationAction} className="flex gap-2">
          <input name="name" defaultValue={org?.name} className="flex-1 rounded border p-2" />
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Save
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Join code</h2>
        <p className="text-2xl font-mono">{org?.joinCode}</p>
        {caller.role === "owner" && (
          <form action={rotateJoinCodeAction}>
            <button type="submit" className="rounded border px-3 py-2">
              Rotate code
            </button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Members</h2>
        <ul className="space-y-2">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between">
              <span>
                {member.name ?? member.email} — {member.role}
              </span>
              {caller.role === "owner" && member.userId !== caller.userId && (
                <form action={removeMemberAction}>
                  <input type="hidden" name="userId" value={member.userId} />
                  <button type="submit" className="text-sm text-red-600 underline">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <form action={leaveOrganizationAction}>
        <button type="submit" className="text-sm text-red-600 underline">
          Leave organization
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

With `pnpm dev` running and signed in as the owner account from Task 6: visit `/settings`, confirm the join code and member list display, rotate the join code and confirm it changes, rename the organization and confirm it persists after reload. Sign in as the second (member) account and confirm the "Rotate code" button and "Remove" links are absent (member, not owner).

- [ ] **Step 5: Commit**

```bash
git add app/actions/organizations.ts app/settings
git commit -m "feat: add organization settings page for members and join code"
```

---

### Task 8: Scope `lib/matching.ts` and `lib/db/queries.ts` by organization

**Files:**
- Modify: `lib/matching.ts`
- Modify: `lib/db/queries.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (all functions gain a leading `organizationId: string` parameter, same return shapes as before):
  - `normalizeName(value: string)` — unchanged.
  - `findMatchingItem(organizationId: string, rawName: string)`
  - `findOrCreateItem(organizationId: string, input: {...})`
  - `searchItems(organizationId: string, query: string)`
  - `getOnHandLots(organizationId: string)`
  - `getExpiringLots(organizationId: string, withinDays = 4)`
  - `getInventorySummary(organizationId: string)`
  - `getRecentPurchases(organizationId: string, days = 21)`
  - `getLastPurchaseForItem(organizationId: string, itemId: string)`
  - `getReceipts(organizationId: string)`
  - `getReceiptWithLines(organizationId: string, id: string)`
  - `getOpenLists(organizationId: string)`
  - `getListWithItems(organizationId: string, id: string)`
  - `getOrCreateDefaultList(organizationId: string)`
  - `getRecipes(organizationId: string)`
  - `getCatalogItems(organizationId: string)`
  - `lookupShouldHave(organizationId: string, query: string)`

- [ ] **Step 1: Scope `lib/matching.ts`**

Rewrite `lib/matching.ts`:

```ts
import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "./db";
import { items } from "./db/schema";
import { titleCase } from "./format";
import type { Category, Location } from "./types";

export function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(organic|og|fresh|store|brand|select|value|extra|large|small|ct|pk|pack)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export async function findMatchingItem(organizationId: string, rawName: string) {
  const normalized = normalizeName(rawName);
  if (!normalized) return null;

  const exact = await db.query.items.findFirst({
    where: and(eq(items.organizationId, organizationId), eq(items.normalizedName, normalized)),
  });
  if (exact) return exact;

  const tokens = normalized.split(" ").filter((token) => token.length > 2);
  const fuzzy = await db.query.items.findMany({
    where: and(
      eq(items.organizationId, organizationId),
      or(
        ilike(items.name, `%${normalized}%`),
        ilike(items.normalizedName, `%${normalized}%`),
        ...tokens.slice(0, 3).map((token) => ilike(items.name, `%${token}%`)),
      ),
    ),
    limit: 8,
  });

  const scored = fuzzy
    .map((item) => {
      const haystack = `${item.normalizedName} ${(item.aliases ?? []).join(" ")}`;
      const overlap = tokens.filter((token) => haystack.includes(token)).length;
      const contains = haystack.includes(normalized) || normalized.includes(item.normalizedName);
      return { item, score: overlap + (contains ? 3 : 0) };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score > 0 ? scored[0].item : null;
}

export async function findOrCreateItem(
  organizationId: string,
  input: {
    name: string;
    category?: string;
    unit?: string;
    perishable?: boolean;
    location?: string;
    shelfLifeDays?: number | null;
  },
) {
  const existing = await findMatchingItem(organizationId, input.name);
  if (existing) return existing;

  const [created] = await db
    .insert(items)
    .values({
      organizationId,
      name: titleCase(input.name),
      normalizedName: normalizeName(input.name) || input.name.toLowerCase(),
      category: (input.category as Category | undefined) ?? "other",
      defaultUnit: input.unit ?? "each",
      perishable: input.perishable ?? true,
      defaultLocation: (input.location as Location | undefined) ?? "pantry",
      typicalShelfLifeDays: input.shelfLifeDays ?? null,
      aliases: [input.name],
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  return db.query.items.findFirst({
    where: and(
      eq(items.organizationId, organizationId),
      eq(items.normalizedName, normalizeName(input.name)),
    ),
  });
}

export async function searchItems(organizationId: string, query: string) {
  const normalized = normalizeName(query);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  return db.query.items.findMany({
    where: and(
      eq(items.organizationId, organizationId),
      or(
        ilike(items.name, `%${normalized}%`),
        ilike(items.normalizedName, `%${normalized}%`),
        ...tokens.slice(0, 3).map((token) => ilike(items.name, `%${token}%`)),
      ),
    ),
    limit: 12,
  });
}
```

- [ ] **Step 2: Scope `lib/db/queries.ts`**

Rewrite `lib/db/queries.ts`, adding an `organizationId: string` first parameter to every exported function and an `eq(<table>.organizationId, organizationId)` clause `and`-ed into every `where`:

```ts
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "./index";
import {
  inventoryLots,
  items,
  purchases,
  receiptLines,
  receipts,
  recipeIngredients,
  recipes,
  shoppingListItems,
  shoppingLists,
} from "./schema";

export async function getOnHandLots(organizationId: string) {
  return db
    .select({ lot: inventoryLots, item: items })
    .from(inventoryLots)
    .innerJoin(items, eq(items.id, inventoryLots.itemId))
    .where(
      and(
        eq(inventoryLots.organizationId, organizationId),
        eq(inventoryLots.status, "on_hand"),
        sql`${inventoryLots.quantity} > 0`,
      ),
    )
    .orderBy(inventoryLots.expiresAt, items.name);
}

export async function getExpiringLots(organizationId: string, withinDays = 4) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  return db
    .select({ lot: inventoryLots, item: items })
    .from(inventoryLots)
    .innerJoin(items, eq(items.id, inventoryLots.itemId))
    .where(
      and(
        eq(inventoryLots.organizationId, organizationId),
        eq(inventoryLots.status, "on_hand"),
        sql`${inventoryLots.quantity} > 0`,
        isNotNull(inventoryLots.expiresAt),
        lte(inventoryLots.expiresAt, cutoff),
      ),
    )
    .orderBy(inventoryLots.expiresAt);
}

export async function getInventorySummary(organizationId: string) {
  const lots = await getOnHandLots(organizationId);
  const byLocation = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const row of lots) {
    byLocation.set(row.lot.location, (byLocation.get(row.lot.location) ?? 0) + 1);
    byCategory.set(row.item.category, (byCategory.get(row.item.category) ?? 0) + 1);
  }
  return { lots, totalLots: lots.length, byLocation, byCategory };
}

export async function getRecentPurchases(organizationId: string, days = 21) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return db
    .select({ purchase: purchases, item: items })
    .from(purchases)
    .innerJoin(items, eq(items.id, purchases.itemId))
    .where(and(eq(purchases.organizationId, organizationId), gte(purchases.purchasedAt, since)))
    .orderBy(desc(purchases.purchasedAt));
}

export async function getLastPurchaseForItem(organizationId: string, itemId: string) {
  const [row] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.organizationId, organizationId), eq(purchases.itemId, itemId)))
    .orderBy(desc(purchases.purchasedAt))
    .limit(1);
  return row ?? null;
}

export async function getReceipts(organizationId: string) {
  return db
    .select()
    .from(receipts)
    .where(eq(receipts.organizationId, organizationId))
    .orderBy(desc(receipts.purchasedAt));
}

export async function getReceiptWithLines(organizationId: string, id: string) {
  const receipt = await db.query.receipts.findFirst({
    where: and(eq(receipts.organizationId, organizationId), eq(receipts.id, id)),
  });
  if (!receipt) return null;
  const lines = await db
    .select({ line: receiptLines, item: items })
    .from(receiptLines)
    .leftJoin(items, eq(items.id, receiptLines.itemId))
    .where(eq(receiptLines.receiptId, id));
  return { receipt, lines };
}

export async function getOpenLists(organizationId: string) {
  return db
    .select()
    .from(shoppingLists)
    .where(and(eq(shoppingLists.organizationId, organizationId), eq(shoppingLists.status, "open")))
    .orderBy(desc(shoppingLists.createdAt));
}

export async function getListWithItems(organizationId: string, id: string) {
  const list = await db.query.shoppingLists.findFirst({
    where: and(eq(shoppingLists.organizationId, organizationId), eq(shoppingLists.id, id)),
  });
  if (!list) return null;
  const listItems = await db
    .select({ row: shoppingListItems, item: items })
    .from(shoppingListItems)
    .leftJoin(items, eq(items.id, shoppingListItems.itemId))
    .where(eq(shoppingListItems.listId, id));
  return { list, items: listItems };
}

export async function getOrCreateDefaultList(organizationId: string) {
  const existing = await db.query.shoppingLists.findFirst({
    where: and(eq(shoppingLists.organizationId, organizationId), eq(shoppingLists.status, "open")),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(shoppingLists)
    .values({ organizationId, name: "This week's kart" })
    .returning();
  return created;
}

export async function getRecipes(organizationId: string) {
  const all = await db
    .select()
    .from(recipes)
    .where(eq(recipes.organizationId, organizationId))
    .orderBy(desc(recipes.createdAt));
  const recipeIds = all.map((recipe) => recipe.id);
  const ingredients = recipeIds.length
    ? await db.select().from(recipeIngredients)
    : [];
  return all.map((recipe) => ({
    ...recipe,
    ingredients: ingredients.filter((ingredient) => ingredient.recipeId === recipe.id),
  }));
}

export async function getCatalogItems(organizationId: string) {
  return db.select().from(items).where(eq(items.organizationId, organizationId)).orderBy(items.name);
}

export async function lookupShouldHave(organizationId: string, query: string) {
  const { searchItems } = await import("../matching");
  const matches = await searchItems(organizationId, query);
  const results = await Promise.all(
    matches.map(async (item) => {
      const lots = await db
        .select()
        .from(inventoryLots)
        .where(
          and(
            eq(inventoryLots.organizationId, organizationId),
            eq(inventoryLots.itemId, item.id),
            eq(inventoryLots.status, "on_hand"),
            sql`${inventoryLots.quantity} > 0`,
          ),
        );
      const lastPurchase = await getLastPurchaseForItem(organizationId, item.id);
      return { item, lots, lastPurchase };
    }),
  );
  return results;
}
```

Note: `getRecipes` was tightened to only fetch `recipeIngredients` when there are recipes to match against — this is a small existing-code improvement encountered while adding scoping, not unrelated cleanup (the original fetched all ingredients unconditionally, which now would leak across organizations without the recipe-id guard).

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: fails, listing every call site in `app/**` and `app/actions/**` that calls these functions without an `organizationId` argument. That's expected — those call sites are fixed in Tasks 9–10. Confirm the errors are only in those two directories (no unexpected breakage elsewhere), then proceed; do not fix call sites in this task.

- [ ] **Step 4: Commit**

```bash
git add lib/matching.ts lib/db/queries.ts
git commit -m "feat: scope matching and query functions by organizationId"
```

---

### Task 9: Extract inventory and lists into `lib/domain`

**Files:**
- Create: `lib/domain/inventory.ts`
- Create: `lib/domain/lists.ts`
- Modify: `app/actions/inventory.ts`
- Modify: `app/actions/lists.ts`

**Interfaces:**
- Consumes: `Caller` from `lib/domain/caller.ts`; `findOrCreateItem` from `lib/matching.ts`; `getOrCreateDefaultList` from `lib/db/queries.ts`; `resolveCaller` from `app/actions/organizations.ts`.
- Produces:
  - `addInventoryItem(caller: Caller, input: { name: string; category?: string; unit?: string; location?: string; perishable?: boolean; purchasedAt?: string; expiresAt?: string; quantity?: number; notes?: string; store?: string }): Promise<void>`
  - `adjustLotQuantity(caller: Caller, lotId: string, nextQuantity: number): Promise<void>`
  - `markLotGone(caller: Caller, lotId: string, status: "used_up" | "discarded"): Promise<void>`
  - `addListItem(caller: Caller, input: { name: string; listId?: string; quantity?: number; unit?: string; reason?: string }): Promise<string>` (returns list id)
  - `toggleListItem(caller: Caller, id: string, checked: boolean): Promise<void>`
  - `createShoppingList(caller: Caller, name: string): Promise<string>`
  - `addMissingIngredientsToList(caller: Caller, ingredients: { name: string; quantity: number | null; unit: string | null }[]): Promise<string>`

- [ ] **Step 1: Write `lib/domain/inventory.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventoryLots, purchases } from "@/lib/db/schema";
import { findOrCreateItem } from "@/lib/matching";
import type { Caller } from "./caller";

export interface AddInventoryItemInput {
  name: string;
  category?: string;
  unit?: string;
  location?: string;
  perishable?: boolean;
  purchasedAt?: string;
  expiresAt?: string;
  quantity?: number;
  notes?: string;
  store?: string;
}

function parseDate(raw: string | undefined) {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function addInventoryItem(caller: Caller, input: AddInventoryItemInput) {
  const name = input.name.trim();
  if (!name) return;

  const item = await findOrCreateItem(caller.organizationId, {
    name,
    category: input.category ?? "other",
    unit: input.unit ?? "each",
    location: input.location ?? "pantry",
    perishable: input.perishable ?? false,
  });
  if (!item) return;

  const purchasedAt = parseDate(input.purchasedAt) ?? new Date();
  const expiresAt = parseDate(input.expiresAt);
  const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const unit = input.unit ?? item.defaultUnit;
  const location = input.location ?? item.defaultLocation;

  await db.insert(inventoryLots).values({
    organizationId: caller.organizationId,
    itemId: item.id,
    quantity,
    unit,
    location,
    purchasedAt,
    expiresAt:
      expiresAt ??
      (item.typicalShelfLifeDays
        ? new Date(purchasedAt.getTime() + item.typicalShelfLifeDays * 86_400_000)
        : null),
    notes: input.notes?.trim() || null,
    status: "on_hand",
  });

  await db.insert(purchases).values({
    organizationId: caller.organizationId,
    itemId: item.id,
    quantity,
    unit,
    purchasedAt,
    store: input.store?.trim() || "Manual add",
    rawName: name,
  });
}

export async function adjustLotQuantity(caller: Caller, lotId: string, nextQuantity: number) {
  const quantity = Math.max(0, nextQuantity);
  await db
    .update(inventoryLots)
    .set({
      quantity,
      status: quantity <= 0 ? "used_up" : "on_hand",
      updatedAt: new Date(),
    })
    .where(and(eq(inventoryLots.id, lotId), eq(inventoryLots.organizationId, caller.organizationId)));
}

export async function markLotGone(
  caller: Caller,
  lotId: string,
  status: "used_up" | "discarded",
) {
  await db
    .update(inventoryLots)
    .set({ quantity: 0, status, updatedAt: new Date() })
    .where(and(eq(inventoryLots.id, lotId), eq(inventoryLots.organizationId, caller.organizationId)));
}
```

Add `and` to the `drizzle-orm` import at the top (`import { and, eq } from "drizzle-orm";`).

- [ ] **Step 2: Write `lib/domain/lists.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getOrCreateDefaultList } from "@/lib/db/queries";
import { shoppingListItems, shoppingLists } from "@/lib/db/schema";
import { findOrCreateItem } from "@/lib/matching";
import type { Caller } from "./caller";

export interface AddListItemInput {
  name: string;
  listId?: string;
  quantity?: number;
  unit?: string;
  reason?: string;
}

export async function addListItem(caller: Caller, input: AddListItemInput) {
  const name = input.name.trim();
  if (!name) return null;

  const list = input.listId
    ? { id: input.listId }
    : await getOrCreateDefaultList(caller.organizationId);

  const item = await findOrCreateItem(caller.organizationId, { name });
  await db.insert(shoppingListItems).values({
    listId: list.id,
    itemId: item?.id ?? null,
    name: item?.name ?? name,
    quantity: input.quantity && input.quantity > 0 ? input.quantity : 1,
    unit: input.unit ?? item?.defaultUnit ?? "each",
    reason: input.reason ?? "manual",
  });
  return list.id;
}

export async function toggleListItem(caller: Caller, id: string, checked: boolean) {
  await db
    .update(shoppingListItems)
    .set({ checked })
    .where(eq(shoppingListItems.id, id));
}

export async function createShoppingList(caller: Caller, name: string) {
  const trimmedName = name.trim() || "Shopping list";
  const [list] = await db
    .insert(shoppingLists)
    .values({ organizationId: caller.organizationId, name: trimmedName })
    .returning();
  return list.id;
}

export async function addMissingIngredientsToList(
  caller: Caller,
  ingredients: { name: string; quantity: number | null; unit: string | null }[],
) {
  const list = await getOrCreateDefaultList(caller.organizationId);
  for (const ingredient of ingredients) {
    const item = await findOrCreateItem(caller.organizationId, { name: ingredient.name });
    await db.insert(shoppingListItems).values({
      listId: list.id,
      itemId: item?.id ?? null,
      name: item?.name ?? ingredient.name,
      quantity: ingredient.quantity ?? 1,
      unit: ingredient.unit ?? item?.defaultUnit ?? "each",
      reason: "recipe",
    });
  }
  return list.id;
}
```

Note: `toggleListItem` does not filter by `organizationId` because `shoppingListItems` has no `organizationId` column (it inherits scope from its parent `shoppingLists` row per the spec). This is acceptable since the item `id` is an unguessable UUID, but for defense in depth, join through the list in the `where` clause:

```ts
export async function toggleListItem(caller: Caller, id: string, checked: boolean) {
  const row = await db.query.shoppingListItems.findFirst({
    where: eq(shoppingListItems.id, id),
    with: { list: true },
  });
  if (!row || row.list.organizationId !== caller.organizationId) return;
  await db.update(shoppingListItems).set({ checked }).where(eq(shoppingListItems.id, id));
}
```

Use this version instead of the simpler one above. It requires the `shoppingListItemsRelations`/`shoppingListsRelations` already defined in `lib/db/schema.ts` (Task 2 did not touch these; they already exist from before this plan).

- [ ] **Step 3: Refactor `app/actions/inventory.ts` to a thin wrapper**

Replace the contents of `app/actions/inventory.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { resolveCaller } from "@/app/actions/organizations";
import { addInventoryItem as addInventoryItemDomain, adjustLotQuantity as adjustLotQuantityDomain, markLotGone as markLotGoneDomain } from "@/lib/domain/inventory";

export async function addInventoryItem(formData: FormData) {
  const caller = await resolveCaller();
  await addInventoryItemDomain(caller, {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "other"),
    unit: String(formData.get("unit") ?? "each"),
    location: String(formData.get("location") ?? "pantry"),
    perishable: formData.get("perishable") === "on",
    purchasedAt: String(formData.get("purchasedAt") ?? ""),
    expiresAt: String(formData.get("expiresAt") ?? ""),
    quantity: Number(formData.get("quantity") ?? 1) || 1,
    notes: String(formData.get("notes") ?? ""),
    store: String(formData.get("store") ?? ""),
  });
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/ask");
}

export async function adjustLotQuantity(lotId: string, nextQuantity: number) {
  const caller = await resolveCaller();
  await adjustLotQuantityDomain(caller, lotId, nextQuantity);
  revalidatePath("/");
  revalidatePath("/inventory");
}

export async function markLotGone(lotId: string, status: "used_up" | "discarded") {
  const caller = await resolveCaller();
  await markLotGoneDomain(caller, lotId, status);
  revalidatePath("/");
  revalidatePath("/inventory");
}
```

- [ ] **Step 4: Refactor `app/actions/lists.ts` to a thin wrapper**

Replace the contents of `app/actions/lists.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { resolveCaller } from "@/app/actions/organizations";
import {
  addListItem as addListItemDomain,
  createShoppingList as createShoppingListDomain,
  toggleListItem as toggleListItemDomain,
  addMissingIngredientsToList as addMissingIngredientsToListDomain,
} from "@/lib/domain/lists";

export async function addListItem(formData: FormData) {
  const caller = await resolveCaller();
  const listId = String(formData.get("listId") ?? "");
  const resultListId = await addListItemDomain(caller, {
    name: String(formData.get("name") ?? ""),
    listId: listId || undefined,
    quantity: Number(formData.get("quantity") ?? 1) || 1,
    unit: String(formData.get("unit") ?? ""),
    reason: String(formData.get("reason") ?? "manual"),
  });
  revalidatePath("/lists");
  if (resultListId) revalidatePath(`/lists/${resultListId}`);
}

export async function toggleListItem(id: string, checked: boolean) {
  const caller = await resolveCaller();
  await toggleListItemDomain(caller, id, checked);
  revalidatePath("/lists");
}

export async function createShoppingList(formData: FormData) {
  const caller = await resolveCaller();
  const id = await createShoppingListDomain(caller, String(formData.get("name") ?? ""));
  revalidatePath("/lists");
  return id;
}

export async function addMissingIngredientsToList(
  ingredients: { name: string; quantity: number | null; unit: string | null }[],
) {
  const caller = await resolveCaller();
  const listId = await addMissingIngredientsToListDomain(caller, ingredients);
  revalidatePath("/lists");
  revalidatePath("/recipes");
  return listId;
}
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: errors remaining only in `app/actions/receipts.ts`, `app/actions/recipes.ts`, `app/actions/ask.ts`, and any page/component that directly called `lib/db/queries.ts` functions without an `organizationId` (fixed in Tasks 10–11). Confirm `app/actions/inventory.ts` and `app/actions/lists.ts` themselves compile cleanly.

- [ ] **Step 6: Manual verification**

Run `pnpm dev`, signed in with an active organization. Add an inventory item via the UI, confirm it appears. Add a list item, toggle it checked, confirm state persists. In `pnpm db:studio`, confirm the new `inventory_lots`/`purchases`/`shopping_list_items` rows carry the correct `organization_id` (via the parent list for list items).

- [ ] **Step 7: Commit**

```bash
git add lib/domain/inventory.ts lib/domain/lists.ts app/actions/inventory.ts app/actions/lists.ts
git commit -m "refactor: extract inventory and lists logic into lib/domain"
```

---

### Task 10: Extract receipts, recipes, and ask into `lib/domain`

**Files:**
- Create: `lib/domain/receipts.ts`
- Create: `lib/domain/recipes.ts`
- Create: `lib/domain/ask.ts`
- Modify: `app/actions/receipts.ts`
- Modify: `app/actions/recipes.ts`
- Modify: `app/actions/ask.ts`

**Interfaces:**
- Consumes: `Caller`; `getOnHandLots`, `getRecentPurchases`, `lookupShouldHave` from `lib/db/queries.ts`; `findOrCreateItem`, `findMatchingItem` from `lib/matching.ts`; `extractReceipt`, `suggestRecipesFromInventory`, `answerInventoryQuestion` from `lib/ai.ts` (unchanged).
- Produces:
  - `parseReceiptImage(imageDataUrl: string): Promise<{ extracted?: ExtractedReceipt; error?: string }>` — no `Caller` needed, pure AI extraction, does not touch the DB.
  - `confirmReceipt(caller: Caller, input: {...}): Promise<{ receiptId: string }>`
  - `generateRecipes(caller: Caller): Promise<{ count: number }>` — throws `ValidationError` if no inventory.
  - `askAboutGroceries(caller: Caller, question: string): Promise<AskResult>`
  - `type ExtractedReceipt`, `type AskResult` (moved here from the old action files).

- [ ] **Step 1: Write `lib/domain/receipts.ts`**

```ts
import { extractReceipt } from "@/lib/ai";
import { db } from "@/lib/db";
import { inventoryLots, purchases, receiptLines, receipts } from "@/lib/db/schema";
import { findOrCreateItem } from "@/lib/matching";
import type { Caller } from "./caller";

export type ExtractedReceipt = Awaited<ReturnType<typeof extractReceipt>>;

export async function parseReceiptImage(imageDataUrl: string) {
  try {
    const extracted = await extractReceipt(imageDataUrl);
    return { extracted };
  } catch (error) {
    console.error(error);
    return {
      error: "Could not read that receipt. Check AI Gateway access, then try a sharper photo.",
    };
  }
}

export interface ConfirmReceiptInput {
  store: string;
  purchasedAt: string;
  total: number | null;
  items: {
    name: string;
    quantity: number;
    unit: string;
    price: number | null;
    category: string;
    addToInventory: boolean;
  }[];
}

export async function confirmReceipt(caller: Caller, input: ConfirmReceiptInput) {
  const purchasedAt = input.purchasedAt ? new Date(input.purchasedAt) : new Date();
  const [receipt] = await db
    .insert(receipts)
    .values({
      organizationId: caller.organizationId,
      store: input.store || "Unknown store",
      purchasedAt,
      totalCents: input.total != null ? Math.round(input.total * 100) : null,
      status: "confirmed",
    })
    .returning();

  for (const line of input.items) {
    if (!line.name.trim()) continue;
    const item = await findOrCreateItem(caller.organizationId, {
      name: line.name,
      category: line.category,
      unit: line.unit,
    });
    if (!item) continue;

    await db.insert(receiptLines).values({
      receiptId: receipt.id,
      rawName: line.name,
      itemId: item.id,
      quantity: line.quantity,
      unit: line.unit,
      priceCents: line.price != null ? Math.round(line.price * 100) : null,
      category: line.category,
      addedToInventory: line.addToInventory,
    });

    await db.insert(purchases).values({
      organizationId: caller.organizationId,
      itemId: item.id,
      quantity: line.quantity,
      unit: line.unit,
      purchasedAt,
      store: input.store,
      receiptId: receipt.id,
      rawName: line.name,
    });

    if (line.addToInventory) {
      await db.insert(inventoryLots).values({
        organizationId: caller.organizationId,
        itemId: item.id,
        quantity: line.quantity,
        unit: line.unit,
        location: item.defaultLocation,
        purchasedAt,
        expiresAt: item.typicalShelfLifeDays
          ? new Date(purchasedAt.getTime() + item.typicalShelfLifeDays * 86_400_000)
          : null,
        receiptId: receipt.id,
        status: "on_hand",
      });
    }
  }

  return { receiptId: receipt.id };
}
```

- [ ] **Step 2: Write `lib/domain/recipes.ts`**

```ts
import { suggestRecipesFromInventory } from "@/lib/ai";
import { db } from "@/lib/db";
import { getOnHandLots } from "@/lib/db/queries";
import { recipeIngredients, recipes } from "@/lib/db/schema";
import { formatQty } from "@/lib/format";
import { findMatchingItem } from "@/lib/matching";
import { ValidationError } from "./errors";
import type { Caller } from "./caller";

export async function generateRecipes(caller: Caller) {
  const lots = await getOnHandLots(caller.organizationId);
  if (lots.length === 0) {
    throw new ValidationError("Add some inventory first so recipes have something to cook with.");
  }

  const inventoryLines = lots.map(
    ({ item, lot }) =>
      `${item.name} — ${formatQty(lot.quantity, lot.unit)} in the ${lot.location}${lot.expiresAt ? `, use by ${lot.expiresAt.toISOString().slice(0, 10)}` : ""}`,
  );

  const suggestions = await suggestRecipesFromInventory(inventoryLines);
  const saved: string[] = [];

  for (const suggestion of suggestions) {
    const [recipe] = await db
      .insert(recipes)
      .values({
        organizationId: caller.organizationId,
        title: suggestion.title,
        servings: suggestion.servings,
        instructions: `${suggestion.why}\n\n${suggestion.instructions.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
        source: "ai",
      })
      .returning();

    for (const ingredient of suggestion.ingredients) {
      const match = await findMatchingItem(caller.organizationId, ingredient.name);
      await db.insert(recipeIngredients).values({
        recipeId: recipe.id,
        itemId: match?.id ?? null,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        onHand: ingredient.onHand,
      });
    }
    saved.push(recipe.id);
  }

  return { count: saved.length };
}
```

- [ ] **Step 3: Write `lib/domain/ask.ts`**

```ts
import { answerInventoryQuestion } from "@/lib/ai";
import { getOnHandLots, getRecentPurchases, lookupShouldHave } from "@/lib/db/queries";
import { formatDate, formatQty } from "@/lib/format";
import type { Caller } from "./caller";

export interface AskResult {
  question: string;
  answer: string;
  confidence: "high" | "medium" | "low";
  matches: {
    name: string;
    onHand: string | null;
    lastBought: string | null;
  }[];
}

export async function askAboutGroceries(caller: Caller, question: string): Promise<AskResult> {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    return {
      question: trimmedQuestion,
      answer: "Ask whether the house should still have something.",
      confidence: "low",
      matches: [],
    };
  }

  const [structured, lots, recentPurchases] = await Promise.all([
    lookupShouldHave(caller.organizationId, trimmedQuestion),
    getOnHandLots(caller.organizationId),
    getRecentPurchases(caller.organizationId, 21),
  ]);

  const matches = structured.map((row) => ({
    name: row.item.name,
    onHand:
      row.lots.length > 0
        ? row.lots
            .map((lot) => `${formatQty(lot.quantity, lot.unit)} in the ${lot.location}`)
            .join("; ")
        : null,
    lastBought: row.lastPurchase
      ? `${formatDate(row.lastPurchase.purchasedAt)}${row.lastPurchase.store ? ` at ${row.lastPurchase.store}` : ""}`
      : null,
  }));

  if (trimmedQuestion.split(/\s+/).length <= 4 && matches.length > 0) {
    const first = matches[0];
    let answer = `No current inventory for ${first.name}.`;
    if (first.onHand) {
      answer = `Inventory still shows ${first.name}: ${first.onHand}. We have not tracked whether it was used.`;
    } else if (first.lastBought) {
      answer = `Nothing is marked on hand, but ${first.name} was bought ${first.lastBought}. We should have it unless it already got used.`;
    }
    return { question: trimmedQuestion, answer, confidence: first.onHand ? "high" : "medium", matches };
  }

  try {
    const ai = await answerInventoryQuestion({
      question: trimmedQuestion,
      inventoryLines: lots.map(
        ({ item, lot }) => `${item.name}: ${formatQty(lot.quantity, lot.unit)} (${lot.location})`,
      ),
      purchaseLines: recentPurchases.map(
        ({ item, purchase }) =>
          `${item.name} bought ${formatDate(purchase.purchasedAt)}${purchase.store ? ` at ${purchase.store}` : ""}`,
      ),
    });
    return { question: trimmedQuestion, answer: ai.answer, confidence: ai.confidence, matches };
  } catch {
    if (matches.length > 0) {
      return {
        question: trimmedQuestion,
        answer: matches
          .map((match) =>
            match.onHand
              ? `${match.name} looks on hand (${match.onHand}).`
              : `${match.name} is not in inventory${match.lastBought ? `, last bought ${match.lastBought}` : ""}.`,
          )
          .join(" "),
        confidence: "medium",
        matches,
      };
    }
    return {
      question: trimmedQuestion,
      answer: "No matching item in the catalog, and AI lookup is unavailable. Try a simpler name like milk or eggs.",
      confidence: "low",
      matches,
    };
  }
}
```

- [ ] **Step 4: Refactor `app/actions/receipts.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { resolveCaller } from "@/app/actions/organizations";
import {
  parseReceiptImage as parseReceiptImageDomain,
  confirmReceipt as confirmReceiptDomain,
  type ExtractedReceipt,
} from "@/lib/domain/receipts";

export type { ExtractedReceipt };

export async function parseReceiptImage(formData: FormData) {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Add a photo of the receipt first." };
  }
  if (file.size > 8_000_000) {
    return { error: "Keep the photo under 8MB." };
  }
  await resolveCaller();
  const bytes = Buffer.from(await file.arrayBuffer());
  const imageDataUrl = `data:${file.type || "image/jpeg"};base64,${bytes.toString("base64")}`;
  return parseReceiptImageDomain(imageDataUrl);
}

export async function confirmReceipt(input: {
  store: string;
  purchasedAt: string;
  total: number | null;
  items: {
    name: string;
    quantity: number;
    unit: string;
    price: number | null;
    category: string;
    addToInventory: boolean;
  }[];
}) {
  const caller = await resolveCaller();
  const result = await confirmReceiptDomain(caller, input);
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/receipts");
  revalidatePath("/ask");
  return { ok: true, receiptId: result.receiptId };
}
```

- [ ] **Step 5: Refactor `app/actions/recipes.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { resolveCaller } from "@/app/actions/organizations";
import { generateRecipes as generateRecipesDomain } from "@/lib/domain/recipes";
import { ValidationError } from "@/lib/domain/errors";

export async function generateRecipes() {
  const caller = await resolveCaller();
  try {
    const result = await generateRecipesDomain(caller);
    revalidatePath("/recipes");
    return { ok: true, count: result.count };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    console.error(error);
    return { error: "Recipe suggestions need AI Gateway access. Try again after it is configured." };
  }
}
```

- [ ] **Step 6: Refactor `app/actions/ask.ts`**

```ts
"use server";

import { resolveCaller } from "@/app/actions/organizations";
import { askAboutGroceries as askAboutGroceriesDomain, type AskResult } from "@/lib/domain/ask";

export type { AskResult };

export async function askAboutGroceries(formData: FormData): Promise<AskResult> {
  const caller = await resolveCaller();
  const question = String(formData.get("q") ?? "");
  return askAboutGroceriesDomain(caller, question);
}
```

- [ ] **Step 7: Verify build**

Run: `pnpm build`
Expected: succeeds with zero errors. If any page/component still imports a query function without `organizationId` (e.g. a page under `app/**` calling `getOnHandLots()` directly), fix that call site to pass `(await resolveCaller()).organizationId` or, for server components that only need read access, fetch the caller directly via `auth()` and redirect if missing — mirror the pattern in `app/settings/page.tsx` from Task 7.

- [ ] **Step 8: Manual verification**

Run `pnpm dev`. As the owner account, scan a receipt (or manually confirm one if AI Gateway isn't configured locally), generate recipes from inventory, and ask a "do we have X" question — confirm all three flows still work end-to-end and only show data for the active organization.

- [ ] **Step 9: Commit**

```bash
git add lib/domain/receipts.ts lib/domain/recipes.ts lib/domain/ask.ts app/actions/receipts.ts app/actions/recipes.ts app/actions/ask.ts
git commit -m "refactor: extract receipts, recipes, and ask logic into lib/domain"
```

---

### Task 11: Fix remaining page/component call sites for organization scoping

**Files:**
- Modify: whichever files under `app/**` (pages, layouts) call `lib/db/queries.ts` functions directly — identify exact list via the build error from Task 10 Step 7 if any remain, plus a proactive grep in Step 1 below.

**Interfaces:**
- Consumes: `resolveCaller` from `app/actions/organizations.ts` (for pages that need to redirect unauthenticated/no-org users) or `auth()` from `lib/auth.ts` directly for pages that already have other redirect logic.
- Produces: no new exports — every page compiles and renders only the active organization's data.

- [ ] **Step 1: Find every remaining call site**

Run: `grep -rn "getOnHandLots\|getExpiringLots\|getInventorySummary\|getRecentPurchases\|getLastPurchaseForItem\|getReceipts\|getReceiptWithLines\|getOpenLists\|getListWithItems\|getOrCreateDefaultList\|getRecipes(\|getCatalogItems\|lookupShouldHave" app --include="*.tsx" --include="*.ts" -l`

This lists every file besides the ones already fixed in Tasks 9–10 that needs updating.

- [ ] **Step 2: Update each file**

For each file found, add `const caller = await resolveCaller();` (if the page requires the user to be signed in and organized — this is true for every existing page in this app, since there's no public/anonymous view) at the top of the server component function, and pass `caller.organizationId` as the first argument to each query call. Import `resolveCaller` from `@/app/actions/organizations`.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: zero errors.

- [ ] **Step 4: Manual full-app walkthrough**

Run `pnpm dev`. Sign in as the owner account and click through every page in the app's nav (`app-shell.tsx` lists them). Confirm every page renders without error and shows only that organization's data. Sign in as the second (member) account in a different browser/incognito window, confirm it sees its own organization's separate data (empty, unless it was also added to the owner's org in earlier testing — if so, confirm it correctly sees the owner's org's shared data, not a mix).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: scope remaining page queries by active organization"
```

---

### Task 12: OAuth 2.1 primitives — PKCE, JWT, client and code storage

**Files:**
- Create: `lib/oauth/pkce.ts`
- Create: `lib/oauth/jwt.ts`
- Create: `lib/oauth/clients.ts`
- Create: `lib/oauth/codes.ts`
- Modify: `lib/db/schema.ts` (add `oauthClients`, `oauthAuthorizationCodes`, `oauthRefreshTokens` tables)

**Interfaces:**
- Produces:
  - Schema: `oauthClients { id, name, redirectUris: string[], createdAt }`, `oauthAuthorizationCodes { code, clientId, userId, organizationId, redirectUri, codeChallenge, expiresAt }`, `oauthRefreshTokens { token, clientId, userId, organizationId, expiresAt }`.
  - `verifyPkce(codeVerifier: string, codeChallenge: string): boolean`
  - `signAccessToken(payload: { userId: string; organizationId: string; clientId: string; scope: string }): Promise<string>`
  - `verifyAccessToken(token: string): Promise<{ userId: string; organizationId: string; clientId: string; scope: string } | null>`
  - `registerClient(name: string, redirectUris: string[]): Promise<{ clientId: string }>`
  - `getClient(clientId: string): Promise<{ id: string; name: string; redirectUris: string[] } | null>`
  - `createAuthorizationCode(input: { clientId: string; userId: string; organizationId: string; redirectUri: string; codeChallenge: string }): Promise<string>`
  - `consumeAuthorizationCode(code: string): Promise<{ clientId: string; userId: string; organizationId: string; redirectUri: string; codeChallenge: string } | null>` (deletes on read — single use)
  - `createRefreshToken(input: { clientId: string; userId: string; organizationId: string }): Promise<string>`
  - `consumeRefreshToken(token: string): Promise<{ clientId: string; userId: string; organizationId: string } | null>`

- [ ] **Step 1: Add OAuth tables to the schema**

Append to `lib/db/schema.ts`:

```ts
export const oauthClients = pgTable("oauth_clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  code: text("code").primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const oauthRefreshTokens = pgTable("oauth_refresh_tokens", {
  token: text("token").primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
```

Run: `pnpm db:push`
Expected: new tables created, no data-loss prompts (these are brand new tables).

- [ ] **Step 2: Write PKCE verification**

Create `lib/oauth/pkce.ts`:

```ts
import { createHash } from "node:crypto";

export function verifyPkce(codeVerifier: string, codeChallenge: string) {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  return computed === codeChallenge;
}
```

- [ ] **Step 3: Write JWT signing/verification**

Create `lib/oauth/jwt.ts`:

```ts
import { SignJWT, jwtVerify } from "jose";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

function getSecret() {
  const secret = process.env.OAUTH_SIGNING_SECRET;
  if (!secret) throw new Error("OAUTH_SIGNING_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload {
  userId: string;
  organizationId: string;
  clientId: string;
  scope: string;
}

export async function signAccessToken(payload: AccessTokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.userId !== "string" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.clientId !== "string" ||
      typeof payload.scope !== "string"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      organizationId: payload.organizationId,
      clientId: payload.clientId,
      scope: payload.scope,
    };
  } catch {
    return null;
  }
}
```

Add to `.env.example`: `OAUTH_SIGNING_SECRET=`

- [ ] **Step 4: Write client registration/lookup**

Create `lib/oauth/clients.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthClients } from "@/lib/db/schema";

export async function registerClient(name: string, redirectUris: string[]) {
  const [client] = await db
    .insert(oauthClients)
    .values({ name, redirectUris })
    .returning();
  return { clientId: client.id };
}

export async function getClient(clientId: string) {
  const client = await db.query.oauthClients.findFirst({
    where: eq(oauthClients.id, clientId),
  });
  if (!client) return null;
  return { id: client.id, name: client.name, redirectUris: client.redirectUris };
}
```

- [ ] **Step 5: Write authorization code and refresh token storage**

Create `lib/oauth/codes.ts`:

```ts
import { eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthAuthorizationCodes, oauthRefreshTokens } from "@/lib/db/schema";

const CODE_TTL_MS = 60_000;
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export interface CreateAuthorizationCodeInput {
  clientId: string;
  userId: string;
  organizationId: string;
  redirectUri: string;
  codeChallenge: string;
}

export async function createAuthorizationCode(input: CreateAuthorizationCodeInput) {
  const code = crypto.randomUUID();
  await db.insert(oauthAuthorizationCodes).values({
    code,
    ...input,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

export async function consumeAuthorizationCode(code: string) {
  const row = await db.query.oauthAuthorizationCodes.findFirst({
    where: eq(oauthAuthorizationCodes.code, code),
  });
  if (!row) return null;
  await db.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.code, code));
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function createRefreshToken(input: {
  clientId: string;
  userId: string;
  organizationId: string;
}) {
  const token = crypto.randomUUID();
  await db.insert(oauthRefreshTokens).values({
    token,
    ...input,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return token;
}

export async function consumeRefreshToken(token: string) {
  const row = await db.query.oauthRefreshTokens.findFirst({
    where: eq(oauthRefreshTokens.token, token),
  });
  if (!row) return null;
  await db.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.token, token));
  if (row.expiresAt.getTime() < Date.now()) return null;
  await db.delete(oauthRefreshTokens).where(lt(oauthRefreshTokens.expiresAt, new Date()));
  return row;
}
```

- [ ] **Step 6: Verify with a throwaway script**

Create `scripts/verify-oauth-primitives.ts`:

```ts
import { verifyPkce } from "../lib/oauth/pkce";
import { signAccessToken, verifyAccessToken } from "../lib/oauth/jwt";
import { createHash } from "node:crypto";

async function main() {
  const verifier = "test-verifier-1234567890";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  console.log("pkce valid", verifyPkce(verifier, challenge) === true ? "PASS" : "FAIL");
  console.log("pkce invalid", verifyPkce("wrong", challenge) === false ? "PASS" : "FAIL");

  const token = await signAccessToken({
    userId: "u1",
    organizationId: "o1",
    clientId: "c1",
    scope: "full",
  });
  const decoded = await verifyAccessToken(token);
  console.log("jwt roundtrip", decoded?.userId === "u1" ? "PASS" : "FAIL");
  console.log("jwt tamper", (await verifyAccessToken(token + "x")) === null ? "PASS" : "FAIL");
  process.exit(0);
}

main();
```

Run: `OAUTH_SIGNING_SECRET=test-secret-at-least-32-characters-long pnpm tsx scripts/verify-oauth-primitives.ts`
Expected: four `PASS` lines.

- [ ] **Step 7: Delete the throwaway script**

```bash
rm scripts/verify-oauth-primitives.ts
```

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.ts lib/oauth/pkce.ts lib/oauth/jwt.ts lib/oauth/clients.ts lib/oauth/codes.ts .env.example
git commit -m "feat: add OAuth 2.1 primitives (PKCE, JWT, clients, codes)"
```

---

### Task 13: OAuth 2.1 endpoints — register, authorize, token, discovery

**Files:**
- Create: `app/api/oauth/register/route.ts`
- Create: `app/api/oauth/authorize/page.tsx`
- Create: `app/api/oauth/authorize/actions.ts`
- Create: `app/api/oauth/token/route.ts`
- Create: `app/.well-known/oauth-authorization-server/route.ts`
- Create: `app/.well-known/oauth-protected-resource/route.ts`

**Interfaces:**
- Consumes: everything from Task 12; `auth()` from `lib/auth.ts`; `getOrganizationForUser` from `lib/domain/organizations.ts`.
- Produces: a working OAuth 2.1 authorization-code + PKCE flow reachable at `/api/oauth/*`, discoverable at `/.well-known/oauth-authorization-server`.

- [ ] **Step 1: Read this Next.js version's route handler docs**

Per Global Constraints, check `node_modules/next/dist/docs/` for route handler conventions (reading `request.nextUrl.searchParams`, returning `NextResponse.json`, dynamic route `params` typing) before writing the routes below, and adjust the code in later steps if the installed version's API differs from what's shown.

- [ ] **Step 2: Dynamic client registration**

Create `app/api/oauth/register/route.ts`:

```ts
import { NextResponse } from "next/server";
import { registerClient } from "@/lib/oauth/clients";

export async function POST(request: Request) {
  const body = await request.json();
  const clientName = String(body.client_name ?? "Unnamed client");
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (redirectUris.length === 0) {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const { clientId } = await registerClient(clientName, redirectUris);
  return NextResponse.json({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}
```

- [ ] **Step 3: Authorization endpoint (consent screen)**

Create `app/api/oauth/authorize/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAuthorizationCode } from "@/lib/oauth/codes";

export async function approveAuthorization(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id || !session.user.activeOrganizationId) {
    redirect("/sign-in");
  }

  const clientId = String(formData.get("client_id"));
  const redirectUri = String(formData.get("redirect_uri"));
  const codeChallenge = String(formData.get("code_challenge"));
  const state = formData.get("state") ? String(formData.get("state")) : null;

  const code = await createAuthorizationCode({
    clientId,
    userId: session.user.id,
    organizationId: session.user.activeOrganizationId,
    redirectUri,
    codeChallenge,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}
```

Create `app/api/oauth/authorize/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getClient } from "@/lib/oauth/clients";
import { approveAuthorization } from "./actions";

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/api/oauth/authorize?${new URLSearchParams(params as Record<string, string>).toString()}`)}`);
  }
  if (!session.user.activeOrganizationId) {
    redirect("/onboarding");
  }

  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;
  const codeChallenge = params.code_challenge;
  const codeChallengeMethod = params.code_challenge_method;
  const state = params.state;

  if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== "S256") {
    return <main className="p-6">Invalid authorization request.</main>;
  }

  const client = await getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return <main className="p-6">Unknown client or redirect URI.</main>;
  }

  return (
    <main className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-lg font-semibold">Authorize {client.name}</h1>
      <p className="text-sm text-gray-600">
        Allow {client.name} to access your organization&apos;s grocery data on your behalf?
      </p>
      <form action={approveAuthorization} className="flex gap-2">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        {state && <input type="hidden" name="state" value={state} />}
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          Allow
        </button>
      </form>
    </main>
  );
}
```

Adjust the `searchParams` typing in this step according to what Step 1's docs review found for this Next.js version (some versions pass `searchParams` as a plain object, not a `Promise`) — verify at compile time in Step 6.

- [ ] **Step 4: Token endpoint**

Create `app/api/oauth/token/route.ts`:

```ts
import { NextResponse } from "next/server";
import { verifyPkce } from "@/lib/oauth/pkce";
import { signAccessToken } from "@/lib/oauth/jwt";
import {
  consumeAuthorizationCode,
  consumeRefreshToken,
  createRefreshToken,
} from "@/lib/oauth/codes";

export async function POST(request: Request) {
  const body = await request.formData();
  const grantType = String(body.get("grant_type"));

  if (grantType === "authorization_code") {
    const code = String(body.get("code") ?? "");
    const codeVerifier = String(body.get("code_verifier") ?? "");
    const redirectUri = String(body.get("redirect_uri") ?? "");
    const clientId = String(body.get("client_id") ?? "");

    const stored = await consumeAuthorizationCode(code);
    if (!stored || stored.clientId !== clientId || stored.redirectUri !== redirectUri) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }
    if (!verifyPkce(codeVerifier, stored.codeChallenge)) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }

    const accessToken = await signAccessToken({
      userId: stored.userId,
      organizationId: stored.organizationId,
      clientId: stored.clientId,
      scope: "full",
    });
    const refreshToken = await createRefreshToken({
      clientId: stored.clientId,
      userId: stored.userId,
      organizationId: stored.organizationId,
    });

    return NextResponse.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(body.get("refresh_token") ?? "");
    const stored = await consumeRefreshToken(refreshToken);
    if (!stored) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }

    const accessToken = await signAccessToken({
      userId: stored.userId,
      organizationId: stored.organizationId,
      clientId: stored.clientId,
      scope: "full",
    });
    const newRefreshToken = await createRefreshToken({
      clientId: stored.clientId,
      userId: stored.userId,
      organizationId: stored.organizationId,
    });

    return NextResponse.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: newRefreshToken,
    });
  }

  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}
```

- [ ] **Step 5: Discovery metadata**

Create `app/.well-known/oauth-authorization-server/route.ts`:

```ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
```

Create `app/.well-known/oauth-protected-resource/route.ts`:

```ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    resource: `${origin}/api`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
  });
}
```

- [ ] **Step 6: Verify build**

Run: `pnpm build`
Expected: succeeds. Fix any `searchParams`/route-handler typing mismatches found against this Next.js version's actual API (from Step 1's docs review).

- [ ] **Step 7: Manual end-to-end verification with curl**

With `pnpm dev` running and `OAUTH_SIGNING_SECRET` set in `.env.local`:

```bash
curl -s -X POST http://localhost:3000/api/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Test Client","redirect_uris":["http://localhost:9999/callback"]}'
```
Expected: JSON with a `client_id`.

Generate a PKCE pair and open the authorize URL in a browser where you're signed in:
```bash
VERIFIER=$(openssl rand -base64 32 | tr -d '=+/')
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 | tr '+/' '-_' | tr -d '=')
echo "http://localhost:3000/api/oauth/authorize?client_id=<CLIENT_ID>&redirect_uri=http://localhost:9999/callback&code_challenge=$CHALLENGE&code_challenge_method=S256&state=xyz"
```
Click "Allow" — expect a redirect to `http://localhost:9999/callback?code=...&state=xyz` (this will fail to load since nothing listens on port 9999, but the URL and query params confirm the flow worked). Copy the `code` value, then:

```bash
curl -s -X POST http://localhost:3000/api/oauth/token \
  -d "grant_type=authorization_code&code=<CODE>&code_verifier=$VERIFIER&redirect_uri=http://localhost:9999/callback&client_id=<CLIENT_ID>"
```
Expected: JSON with `access_token` and `refresh_token`.

Also verify: `curl -s http://localhost:3000/.well-known/oauth-authorization-server` returns the discovery JSON.

- [ ] **Step 8: Commit**

```bash
git add app/api/oauth "app/.well-known"
git commit -m "feat: add OAuth 2.1 authorize/token/register endpoints and discovery metadata"
```

---

### Task 14: REST API — shared helpers and inventory/lists/receipts/recipes/ask/organizations routes

**Files:**
- Create: `lib/api/auth.ts`
- Create: `lib/api/respond.ts`
- Create: `app/api/inventory/route.ts`
- Create: `app/api/inventory/[lotId]/route.ts`
- Create: `app/api/lists/route.ts`
- Create: `app/api/lists/[listId]/route.ts`
- Create: `app/api/lists/[listId]/items/route.ts`
- Create: `app/api/receipts/route.ts`
- Create: `app/api/receipts/[receiptId]/route.ts`
- Create: `app/api/recipes/route.ts`
- Create: `app/api/ask/route.ts`

**Interfaces:**
- Consumes: `verifyAccessToken` from `lib/oauth/jwt.ts`; `getOrganizationForUser` from `lib/domain/organizations.ts`; every `lib/domain/*` and `lib/db/queries.ts` function from prior tasks.
- Produces:
  - `authenticateRequest(request: Request): Promise<Caller | null>` in `lib/api/auth.ts` — reads `Authorization: Bearer <token>`, verifies it, re-checks current membership/role via `getOrganizationForUser` (so a removed member's still-valid JWT is rejected).
  - `jsonError(message: string, status: number)` and `jsonOk(data: unknown, status?: number)` in `lib/api/respond.ts`.

- [ ] **Step 1: Read this Next.js version's dynamic-route-params docs**

Per Global Constraints, before writing routes with `[lotId]`/`[listId]`/`[receiptId]` segments, check `node_modules/next/dist/docs/` for how this version types/awaits `params` in route handlers, and use that exact shape in every route below.

- [ ] **Step 2: Write shared REST helpers**

Create `lib/api/respond.ts`:

```ts
import { NextResponse } from "next/server";

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
```

Create `lib/api/auth.ts`:

```ts
import { verifyAccessToken } from "@/lib/oauth/jwt";
import { getOrganizationForUser } from "@/lib/domain/organizations";
import type { Caller } from "@/lib/domain/caller";

export async function authenticateRequest(request: Request): Promise<Caller | null> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  const membership = await getOrganizationForUser(payload.userId, payload.organizationId);
  if (!membership) return null;

  return { userId: payload.userId, organizationId: payload.organizationId, role: membership.role };
}
```

- [ ] **Step 3: Inventory routes**

Create `app/api/inventory/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { getOnHandLots } from "@/lib/db/queries";
import { addInventoryItem } from "@/lib/domain/inventory";

export async function GET(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const lots = await getOnHandLots(caller.organizationId);
  return jsonOk({ lots });
}

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const body = await request.json();
  await addInventoryItem(caller, body);
  return jsonOk({ ok: true }, 201);
}
```

Create `app/api/inventory/[lotId]/route.ts` (adjust the `params` type per Step 1's findings):

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { adjustLotQuantity, markLotGone } from "@/lib/domain/inventory";

export async function PATCH(request: Request, context: { params: Promise<{ lotId: string }> }) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const { lotId } = await context.params;
  const body = await request.json();

  if (typeof body.quantity === "number") {
    await adjustLotQuantity(caller, lotId, body.quantity);
  } else if (body.status === "used_up" || body.status === "discarded") {
    await markLotGone(caller, lotId, body.status);
  } else {
    return jsonError("Provide either `quantity` or `status`.", 400);
  }
  return jsonOk({ ok: true });
}
```

- [ ] **Step 4: Lists routes**

Create `app/api/lists/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { getOpenLists } from "@/lib/db/queries";
import { createShoppingList } from "@/lib/domain/lists";

export async function GET(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const lists = await getOpenLists(caller.organizationId);
  return jsonOk({ lists });
}

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const body = await request.json();
  const id = await createShoppingList(caller, String(body.name ?? ""));
  return jsonOk({ id }, 201);
}
```

Create `app/api/lists/[listId]/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { getListWithItems } from "@/lib/db/queries";

export async function GET(request: Request, context: { params: Promise<{ listId: string }> }) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const { listId } = await context.params;
  const list = await getListWithItems(caller.organizationId, listId);
  if (!list) return jsonError("Not found", 404);
  return jsonOk(list);
}
```

Create `app/api/lists/[listId]/items/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { addListItem, toggleListItem } from "@/lib/domain/lists";

export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const { listId } = await context.params;
  const body = await request.json();
  await addListItem(caller, { ...body, listId });
  return jsonOk({ ok: true }, 201);
}

export async function PATCH(request: Request, context: { params: Promise<{ listId: string }> }) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const body = await request.json();
  if (typeof body.itemId !== "string" || typeof body.checked !== "boolean") {
    return jsonError("Provide `itemId` and `checked`.", 400);
  }
  await toggleListItem(caller, body.itemId, body.checked);
  return jsonOk({ ok: true });
}
```

- [ ] **Step 5: Receipts routes**

Create `app/api/receipts/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { getReceipts } from "@/lib/db/queries";
import { confirmReceipt } from "@/lib/domain/receipts";

export async function GET(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const receipts = await getReceipts(caller.organizationId);
  return jsonOk({ receipts });
}

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const body = await request.json();
  const result = await confirmReceipt(caller, body);
  return jsonOk(result, 201);
}
```

Create `app/api/receipts/[receiptId]/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { getReceiptWithLines } from "@/lib/db/queries";

export async function GET(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const { receiptId } = await context.params;
  const receipt = await getReceiptWithLines(caller.organizationId, receiptId);
  if (!receipt) return jsonError("Not found", 404);
  return jsonOk(receipt);
}
```

Note: `parseReceiptImage` (photo → AI extraction) is intentionally not exposed as a REST route in this task — it takes multipart image upload and is better suited as an MCP tool with a base64 input (Task 15). Add it as a REST route only if the user asks for it later.

- [ ] **Step 6: Recipes and ask routes**

Create `app/api/recipes/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { getRecipes } from "@/lib/db/queries";
import { generateRecipes } from "@/lib/domain/recipes";
import { ValidationError } from "@/lib/domain/errors";

export async function GET(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const recipes = await getRecipes(caller.organizationId);
  return jsonOk({ recipes });
}

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  try {
    const result = await generateRecipes(caller);
    return jsonOk(result, 201);
  } catch (error) {
    if (error instanceof ValidationError) return jsonError(error.message, 400);
    throw error;
  }
}
```

Create `app/api/ask/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { askAboutGroceries } from "@/lib/domain/ask";

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const body = await request.json();
  const result = await askAboutGroceries(caller, String(body.question ?? ""));
  return jsonOk(result);
}
```

- [ ] **Step 7: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 8: Manual verification with curl**

Using an access token obtained from Task 13's Step 7 flow:

```bash
TOKEN=<access_token>
curl -s http://localhost:3000/api/inventory -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:3000/api/inventory -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Milk","quantity":1}'
curl -s http://localhost:3000/api/inventory -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/inventory -H "Authorization: Bearer invalid"
```
Expected: first call returns `{"lots":[]}` (or existing lots), the POST returns `{"ok":true}`, the next GET shows the new Milk lot, and the invalid-token call returns 401.

- [ ] **Step 9: Commit**

```bash
git add lib/api app/api/inventory app/api/lists app/api/receipts app/api/recipes app/api/ask
git commit -m "feat: add REST API routes for inventory, lists, receipts, recipes, and ask"
```

---

### Task 15: OpenAPI spec and organizations REST routes

**Files:**
- Create: `lib/openapi/spec.ts`
- Create: `app/api/openapi.json/route.ts`
- Create: `app/api/organizations/route.ts`
- Create: `app/api/organizations/switch/route.ts`
- Create: `app/api/organizations/members/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 12–14; `listMembers`, `switchActiveOrganization`, `rotateJoinCode`, `renameOrganization`, `removeMember` from `lib/domain/organizations.ts`.
- Produces: `/api/openapi.json` serving a valid OpenAPI 3.1 document covering every route created in Tasks 14–15.

- [ ] **Step 1: Organization management REST routes**

Create `app/api/organizations/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { renameOrganization } from "@/lib/domain/organizations";

export async function PATCH(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const body = await request.json();
  try {
    await renameOrganization(caller, String(body.name ?? ""));
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Forbidden", 403);
  }
}
```

Create `app/api/organizations/members/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { listMembers, removeMember } from "@/lib/domain/organizations";

export async function GET(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const members = await listMembers(caller);
  return jsonOk({ members });
}

export async function DELETE(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const body = await request.json();
  try {
    await removeMember(caller, String(body.userId ?? ""));
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Forbidden", 403);
  }
}
```

Create `app/api/organizations/switch/route.ts`:

```ts
import { authenticateRequest } from "@/lib/api/auth";
import { jsonError, jsonOk } from "@/lib/api/respond";
import { switchActiveOrganization } from "@/lib/domain/organizations";

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const body = await request.json();
  try {
    await switchActiveOrganization(caller.userId, String(body.organizationId ?? ""));
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Forbidden", 403);
  }
}
```

- [ ] **Step 2: Write the OpenAPI spec**

Create `lib/openapi/spec.ts`:

```ts
export const openApiSpec = {
  openapi: "3.1.0",
  info: { title: "GroceryKart API", version: "1.0.0" },
  servers: [{ url: "/api" }],
  paths: {
    "/inventory": {
      get: { summary: "List on-hand inventory lots", responses: { "200": { description: "OK" } } },
      post: { summary: "Add an inventory item", responses: { "201": { description: "Created" } } },
    },
    "/inventory/{lotId}": {
      patch: {
        summary: "Adjust or close out an inventory lot",
        parameters: [{ name: "lotId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/lists": {
      get: { summary: "List open shopping lists", responses: { "200": { description: "OK" } } },
      post: { summary: "Create a shopping list", responses: { "201": { description: "Created" } } },
    },
    "/lists/{listId}": {
      get: {
        summary: "Get a shopping list with items",
        parameters: [{ name: "listId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/lists/{listId}/items": {
      post: {
        summary: "Add an item to a shopping list",
        parameters: [{ name: "listId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Created" } },
      },
      patch: {
        summary: "Check/uncheck a shopping list item",
        parameters: [{ name: "listId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/receipts": {
      get: { summary: "List receipts", responses: { "200": { description: "OK" } } },
      post: { summary: "Confirm a parsed receipt", responses: { "201": { description: "Created" } } },
    },
    "/receipts/{receiptId}": {
      get: {
        summary: "Get a receipt with its lines",
        parameters: [{ name: "receiptId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/recipes": {
      get: { summary: "List saved recipes", responses: { "200": { description: "OK" } } },
      post: { summary: "Generate recipes from on-hand inventory", responses: { "201": { description: "Created" } } },
    },
    "/ask": {
      post: { summary: "Ask whether the house should have an item", responses: { "200": { description: "OK" } } },
    },
    "/organizations": {
      patch: { summary: "Rename the active organization", responses: { "200": { description: "OK" } } },
    },
    "/organizations/members": {
      get: { summary: "List organization members", responses: { "200": { description: "OK" } } },
      delete: { summary: "Remove a member (owner only)", responses: { "200": { description: "OK" } } },
    },
    "/organizations/switch": {
      post: { summary: "Switch active organization", responses: { "200": { description: "OK" } } },
    },
  },
  components: {
    securitySchemes: {
      oauth2: {
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: "/api/oauth/authorize",
            tokenUrl: "/api/oauth/token",
            scopes: { full: "Full access to your organization's data" },
          },
        },
      },
    },
  },
  security: [{ oauth2: ["full"] }],
};
```

- [ ] **Step 3: Serve it**

Create `app/api/openapi.json/route.ts`:

```ts
import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/openapi/spec";

export async function GET() {
  return NextResponse.json(openApiSpec);
}
```

- [ ] **Step 4: Write and run a drift-guard script**

Create `scripts/verify-openapi-drift.ts`:

```ts
import { readdirSync, existsSync } from "node:fs";
import { openApiSpec } from "../lib/openapi/spec";

function toRoutePath(apiPath: string) {
  const segments = apiPath
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment.startsWith("{") ? `[${segment.slice(1, -1)}]` : segment));
  return `app/api/${segments.join("/")}/route.ts`;
}

let ok = true;
for (const apiPath of Object.keys(openApiSpec.paths)) {
  const filePath = toRoutePath(apiPath);
  if (!existsSync(filePath)) {
    console.log(`MISSING: ${apiPath} -> ${filePath}`);
    ok = false;
  }
}
console.log(ok ? "PASS: every documented path has a route.ts" : "FAIL: see MISSING lines above");
process.exit(ok ? 0 : 1);
```

Run: `pnpm tsx scripts/verify-openapi-drift.ts`
Expected: `PASS: every documented path has a route.ts`. Keep this script permanently at `scripts/verify-openapi-drift.ts` (do not delete it) — rerun it any time a route or the spec changes.

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add lib/openapi app/api/openapi.json app/api/organizations scripts/verify-openapi-drift.ts
git commit -m "feat: add organization REST routes and OpenAPI spec with drift guard"
```

---

### Task 16: MCP server

**Files:**
- Create: `lib/mcp/auth.ts`
- Create: `lib/mcp/tools.ts`
- Create: `app/api/mcp/route.ts`

**Interfaces:**
- Consumes: `authenticateRequest`-equivalent logic (adapted for `mcp-handler`'s `verifyMcpToken` signature) from `lib/oauth/jwt.ts` and `lib/domain/organizations.ts`; every `lib/domain/*` function and `lib/db/queries.ts` read function.
- Produces: a working MCP endpoint at `/api/mcp` exposing one tool per domain function/read query, discoverable and callable by MCP Inspector using a token from Task 13's flow.

- [ ] **Step 1: Read `mcp-handler`'s and `@modelcontextprotocol/sdk`'s installed type definitions**

Run: `cat node_modules/mcp-handler/dist/index.d.ts` and `cat node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` (paths may differ slightly by version — use `find node_modules/mcp-handler node_modules/@modelcontextprotocol -name "*.d.ts"` to locate them if these exact paths don't exist). Confirm the exact signatures of `createMcpHandler`, `withMcpAuth`, and `McpServer.registerTool` before writing Step 3–4, and adjust the code below to match if the installed version differs from what's shown.

- [ ] **Step 2: MCP auth adapter**

Create `lib/mcp/auth.ts`:

```ts
import { verifyAccessToken } from "@/lib/oauth/jwt";
import { getOrganizationForUser } from "@/lib/domain/organizations";
import type { Caller } from "@/lib/domain/caller";

export async function verifyMcpToken(
  _request: Request,
  bearerToken?: string,
): Promise<{ token: string; clientId: string; scopes: string[]; extra: Caller } | undefined> {
  if (!bearerToken) return undefined;

  const payload = await verifyAccessToken(bearerToken);
  if (!payload) return undefined;

  const membership = await getOrganizationForUser(payload.userId, payload.organizationId);
  if (!membership) return undefined;

  return {
    token: bearerToken,
    clientId: payload.clientId,
    scopes: [payload.scope],
    extra: { userId: payload.userId, organizationId: payload.organizationId, role: membership.role },
  };
}
```

Adjust the return type/shape to exactly match what Step 1 found `withMcpAuth`'s verify callback expects, if different.

- [ ] **Step 3: Register tools**

Create `lib/mcp/tools.ts`. Use the exact `server.registerTool(name, meta, handler)` signature found in Step 1; the shape below is the target behavior regardless of exact signature details:

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Caller } from "@/lib/domain/caller";
import {
  getOnHandLots,
  getExpiringLots,
  getOpenLists,
  getListWithItems,
  getReceipts,
  getReceiptWithLines,
  getRecipes,
} from "@/lib/db/queries";
import { addInventoryItem, adjustLotQuantity, markLotGone } from "@/lib/domain/inventory";
import { addListItem, toggleListItem, createShoppingList } from "@/lib/domain/lists";
import { confirmReceipt } from "@/lib/domain/receipts";
import { generateRecipes } from "@/lib/domain/recipes";
import { askAboutGroceries } from "@/lib/domain/ask";

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function registerGroceryTools(server: McpServer, caller: Caller) {
  server.registerTool(
    "list_inventory",
    { description: "List all on-hand inventory lots for the active organization.", inputSchema: {} },
    async () => textResult(await getOnHandLots(caller.organizationId)),
  );

  server.registerTool(
    "list_expiring_inventory",
    {
      description: "List inventory lots expiring within N days.",
      inputSchema: { withinDays: z.number().optional() },
    },
    async ({ withinDays }) => textResult(await getExpiringLots(caller.organizationId, withinDays)),
  );

  server.registerTool(
    "add_inventory_item",
    {
      description: "Add an item to on-hand inventory.",
      inputSchema: {
        name: z.string(),
        category: z.string().optional(),
        unit: z.string().optional(),
        location: z.string().optional(),
        perishable: z.boolean().optional(),
        quantity: z.number().optional(),
        expiresAt: z.string().optional(),
        notes: z.string().optional(),
        store: z.string().optional(),
      },
    },
    async (input) => {
      await addInventoryItem(caller, input);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "adjust_inventory_lot_quantity",
    { description: "Adjust the quantity of an inventory lot.", inputSchema: { lotId: z.string(), quantity: z.number() } },
    async ({ lotId, quantity }) => {
      await adjustLotQuantity(caller, lotId, quantity);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "mark_inventory_lot_gone",
    {
      description: "Mark an inventory lot as used up or discarded.",
      inputSchema: { lotId: z.string(), status: z.enum(["used_up", "discarded"]) },
    },
    async ({ lotId, status }) => {
      await markLotGone(caller, lotId, status);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "list_shopping_lists",
    { description: "List open shopping lists.", inputSchema: {} },
    async () => textResult(await getOpenLists(caller.organizationId)),
  );

  server.registerTool(
    "get_shopping_list",
    { description: "Get a shopping list with its items.", inputSchema: { listId: z.string() } },
    async ({ listId }) => textResult(await getListWithItems(caller.organizationId, listId)),
  );

  server.registerTool(
    "create_shopping_list",
    { description: "Create a new shopping list.", inputSchema: { name: z.string() } },
    async ({ name }) => textResult({ id: await createShoppingList(caller, name) }),
  );

  server.registerTool(
    "add_shopping_list_item",
    {
      description: "Add an item to a shopping list (or the default list if none given).",
      inputSchema: {
        name: z.string(),
        listId: z.string().optional(),
        quantity: z.number().optional(),
        unit: z.string().optional(),
      },
    },
    async (input) => {
      const listId = await addListItem(caller, input);
      return textResult({ listId });
    },
  );

  server.registerTool(
    "toggle_shopping_list_item",
    {
      description: "Check or uncheck a shopping list item.",
      inputSchema: { itemId: z.string(), checked: z.boolean() },
    },
    async ({ itemId, checked }) => {
      await toggleListItem(caller, itemId, checked);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "list_receipts",
    { description: "List receipts.", inputSchema: {} },
    async () => textResult(await getReceipts(caller.organizationId)),
  );

  server.registerTool(
    "get_receipt",
    { description: "Get a receipt with its line items.", inputSchema: { receiptId: z.string() } },
    async ({ receiptId }) => textResult(await getReceiptWithLines(caller.organizationId, receiptId)),
  );

  server.registerTool(
    "confirm_receipt",
    {
      description: "Confirm a receipt's parsed line items, recording purchases and optionally inventory.",
      inputSchema: {
        store: z.string(),
        purchasedAt: z.string(),
        total: z.number().nullable(),
        items: z.array(
          z.object({
            name: z.string(),
            quantity: z.number(),
            unit: z.string(),
            price: z.number().nullable(),
            category: z.string(),
            addToInventory: z.boolean(),
          }),
        ),
      },
    },
    async (input) => textResult(await confirmReceipt(caller, input)),
  );

  server.registerTool(
    "list_recipes",
    { description: "List saved recipes.", inputSchema: {} },
    async () => textResult(await getRecipes(caller.organizationId)),
  );

  server.registerTool(
    "generate_recipes",
    { description: "Generate recipe suggestions from on-hand inventory.", inputSchema: {} },
    async () => textResult(await generateRecipes(caller)),
  );

  server.registerTool(
    "ask_about_groceries",
    {
      description: "Ask whether the household should currently have a given item.",
      inputSchema: { question: z.string() },
    },
    async ({ question }) => textResult(await askAboutGroceries(caller, question)),
  );
}
```

Adjust `inputSchema` construction to whatever exact form Step 1 found `registerTool` expects (a raw Zod shape object vs. `z.object({...})` vs. JSON Schema) — the shapes above assume a raw-shape-object convention; change every `inputSchema: {...}` to `z.object({...})` instead if that's what the installed SDK version requires.

- [ ] **Step 4: Wire the route handler**

Create `app/api/mcp/route.ts`:

```ts
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpToken } from "@/lib/mcp/auth";
import { registerGroceryTools } from "@/lib/mcp/tools";
import type { Caller } from "@/lib/domain/caller";

export const maxDuration = 60;

const handler = createMcpHandler(
  (server, { authInfo }) => {
    registerGroceryTools(server, authInfo?.extra as Caller);
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

const authHandler = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
```

Adjust the second argument shape of the server-factory callback (`{ authInfo }`) to match whatever Step 1 found `createMcpHandler`'s server-factory callback actually receives — if `authInfo` isn't passed there, move the `registerGroceryTools` call inside a per-request wrapper as the installed SDK requires (check whether `createMcpHandler` supports per-request tool registration or requires registering tools once with the `Caller` resolved inside each tool handler via a different mechanism — read the SDK's docs/examples under `node_modules/mcp-handler` for the supported pattern and follow it).

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 6: Manual verification with MCP Inspector**

```bash
npx @modelcontextprotocol/inspector
```
In the Inspector UI, connect to `http://localhost:3000/api/mcp` with "Streamable HTTP" transport. It should discover the OAuth metadata from `/.well-known/oauth-authorization-server`, walk through dynamic client registration and the `/api/oauth/authorize` consent screen (sign in if prompted), and land back in the Inspector with a valid session. Call `list_inventory` and `add_inventory_item` tools and confirm they return/mutate the same data visible in the web UI at `http://localhost:3000/inventory`.

- [ ] **Step 7: Commit**

```bash
git add lib/mcp app/api/mcp
git commit -m "feat: add MCP server exposing grocery domain functions as tools"
```

---

### Task 17: Final full-system verification

**Files:** none (verification only).

- [ ] **Step 1: Full build and lint**

Run: `pnpm build && pnpm lint`
Expected: both succeed with zero errors/warnings.

- [ ] **Step 2: End-to-end walkthrough**

With `pnpm dev` running:
1. Sign up two accounts, one creates an organization, the other joins via join code.
2. Confirm both see the same shared inventory/lists/receipts/recipes (same organization), and that a third account creating its *own* organization sees none of that data.
3. Re-run the OAuth flow from Task 13 Step 7 and the curl checks from Task 14 Step 8 once more against the final code, to catch any regressions introduced in Tasks 15–16.
4. Re-run the MCP Inspector check from Task 16 Step 6 once more.
5. Run `pnpm tsx scripts/verify-openapi-drift.ts` once more.

- [ ] **Step 3: Update root documentation**

Read `CLAUDE.md` and `README.md`. If either describes the app as single-household/no-auth in a way that's now inaccurate, update the relevant paragraph(s) to mention organizations, the REST API, and the MCP server, following the existing style of each file. Do not add new sections beyond what's needed to correct now-inaccurate statements.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: update CLAUDE.md and README for organizations, REST API, and MCP server"
```
