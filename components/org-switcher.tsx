"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  switchOrganizationAction,
  type SwitchOrganizationState,
} from "@/app/actions/organizations";

export interface OrgSwitcherOption {
  id: string;
  name: string;
  role: "owner" | "member";
}

export interface OrgSwitcherProps {
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
}

const initialState: SwitchOrganizationState = {};

// R24: only rendered by the settings page when the user belongs to more than
// one organization. Switching writes the new active organization to the
// database, then forces a session refresh (see actions.ts comment) before
// re-rendering so the rest of the app reflects the switch immediately.
export function OrgSwitcher({ organizations, activeOrganizationId }: OrgSwitcherProps) {
  const router = useRouter();
  const { update } = useSession();

  async function handleSwitch(prevState: SwitchOrganizationState, formData: FormData) {
    const result = await switchOrganizationAction(prevState, formData);
    if (!result.error) {
      await update();
      router.refresh();
    }
    return result;
  }

  const [state, formAction, pending] = useActionState(handleSwitch, initialState);

  if (organizations.length <= 1) return null;

  return (
    <section className="space-y-2">
      <h2 className="font-medium">Switch organization</h2>
      <form action={formAction} className="flex gap-2">
        <select
          name="organizationId"
          defaultValue={activeOrganizationId}
          className="flex-1 rounded border p-2"
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name} ({org.role})
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded border px-3 py-2 disabled:opacity-60"
        >
          {pending ? "Switching…" : "Switch"}
        </button>
      </form>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </section>
  );
}
