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
