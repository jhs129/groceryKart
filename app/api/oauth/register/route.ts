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
