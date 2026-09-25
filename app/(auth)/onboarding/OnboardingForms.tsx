"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  createOrganizationAction,
  joinOrganizationAction,
  type OnboardingActionState,
} from "./actions";

const initialState: OnboardingActionState = {};

export function OnboardingForms() {
  const router = useRouter();
  const { update } = useSession();

  async function handleCreate(prevState: OnboardingActionState, formData: FormData) {
    const result = await createOrganizationAction(prevState, formData);
    if (!result.error) {
      // R10: the JWT already carries an `activeOrganizationId` key (set to
      // null at sign-in), so lib/auth.ts's jwt callback short-circuits on
      // plain requests and will not refetch it from the database. A bare
      // redirect("/") would show a stale session. Calling the client
      // `update()` from next-auth/react forces the "update" trigger, which
      // does refetch, then re-signs the session cookie before we navigate.
      await update();
      router.push("/");
      router.refresh();
    }
    return result;
  }

  async function handleJoin(prevState: OnboardingActionState, formData: FormData) {
    const result = await joinOrganizationAction(prevState, formData);
    if (!result.error) {
      await update();
      router.push("/");
      router.refresh();
    }
    return result;
  }

  const [createState, createFormAction, createPending] = useActionState(
    handleCreate,
    initialState,
  );
  const [joinState, joinFormAction, joinPending] = useActionState(handleJoin, initialState);

  return (
    <>
      <form action={createFormAction} className="space-y-3">
        <input
          name="name"
          placeholder="Household name"
          required
          className="w-full rounded border p-2"
        />
        <button
          type="submit"
          disabled={createPending}
          className="w-full rounded bg-black p-2 text-white disabled:opacity-60"
        >
          {createPending ? "Creating…" : "Create a new organization"}
        </button>
        {createState.error ? <p className="text-sm text-red-600">{createState.error}</p> : null}
      </form>
      <div className="text-center text-sm text-gray-500">or</div>
      <form action={joinFormAction} className="space-y-3">
        <input
          name="joinCode"
          placeholder="Join code"
          required
          className="w-full rounded border p-2"
        />
        <button
          type="submit"
          disabled={joinPending}
          className="w-full rounded border p-2 disabled:opacity-60"
        >
          {joinPending ? "Joining…" : "Join an existing organization"}
        </button>
        {joinState.error ? <p className="text-sm text-red-600">{joinState.error}</p> : null}
      </form>
    </>
  );
}
