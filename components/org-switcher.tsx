"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
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

// R24/R35: only rendered by the settings page when the user belongs to more
// than one organization. Switching writes the new active organization to the
// database and refreshes the session cookie server-side (see
// switchOrganizationAction's use of `unstable_update`), so by the time this
// action resolves the cookie already reflects the new organization — a plain
// `router.refresh()` is enough to re-render with it. (R35 found that relying
// on client-side `useSession().update()` instead did not reliably refresh
// the cookie on the installed next-auth beta.)
export function OrgSwitcher({ organizations, activeOrganizationId }: OrgSwitcherProps) {
  const router = useRouter();

  async function handleSwitch(prevState: SwitchOrganizationState, formData: FormData) {
    const result = await switchOrganizationAction(prevState, formData);
    if (!result.error) {
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
