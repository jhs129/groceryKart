import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { authConfig } from "@/lib/auth.config";
import { getOrganizationForUser } from "@/lib/domain/organizations";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
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
