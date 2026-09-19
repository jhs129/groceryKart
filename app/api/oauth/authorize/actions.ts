"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getClient } from "@/lib/oauth/clients";
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

  // SECURITY: this server action is a directly-invocable HTTP endpoint whose
  // FormData is fully attacker-controlled — it can be POSTed to without ever
  // rendering the consent page above. The page's own client/redirect-URI
  // check does NOT protect this action, so clientId/redirectUri must be
  // re-validated here, against the actual registered client, before a code
  // is minted. Never redirect using an unvalidated redirectUri.
  const client = await getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    throw new Error("Unknown client or redirect URI.");
  }

  const code = await createAuthorizationCode({
    clientId: client.id,
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
