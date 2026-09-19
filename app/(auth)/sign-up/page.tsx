"use client";

import { useActionState } from "react";
import { registerUser, type RegisterUserState } from "@/app/actions/auth";

const initialState: RegisterUserState = {};

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(registerUser, initialState);

  return (
    <main className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-semibold">Create an account</h1>
      <form action={formAction} className="space-y-3">
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
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-black p-2 text-white disabled:opacity-60"
        >
          {pending ? "Signing up…" : "Sign up"}
        </button>
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </form>
      <a href="/sign-in" className="block text-sm underline">
        Already have an account? Sign in
      </a>
    </main>
  );
}
