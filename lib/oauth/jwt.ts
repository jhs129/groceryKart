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
