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
