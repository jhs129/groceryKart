import { signIn } from "@/lib/auth";

// Only allow same-origin relative paths as a post-sign-in redirect target.
// Rejects protocol-relative ("//host/...") and absolute ("http://...") URLs
// to avoid an open redirect via the OAuth authorize flow's callbackUrl.
function safeRedirect(callbackUrl: string | string[] | undefined): string {
  // A duplicated query param (?callbackUrl=a&callbackUrl=b) parses to a
  // string[] rather than a string; take the first value in that case
  // instead of letting .startsWith throw a TypeError.
  const value = Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl;
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (/^\/\/?[a-z][a-z0-9+.-]*:/i.test(value)) return "/";
  return value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.callbackUrl);

  return (
    <main className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <form
        action={async (formData) => {
          "use server";
          await signIn("credentials", {
            email: formData.get("email"),
            password: formData.get("password"),
            redirectTo,
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
          await signIn("google", { redirectTo });
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
