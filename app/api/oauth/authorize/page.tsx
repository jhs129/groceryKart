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
