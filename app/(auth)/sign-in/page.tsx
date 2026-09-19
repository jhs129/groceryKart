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
