import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { OrgSwitcher } from "@/components/org-switcher";
import {
  resolveCaller,
  loadMembers,
  loadOrganizationsForCaller,
  renameOrganizationAction,
  removeMemberAction,
  rotateJoinCodeAction,
  leaveOrganizationAction,
} from "@/app/actions/organizations";

export default async function SettingsPage() {
  const caller = await resolveCaller();
  const [org, members, memberOrganizations] = await Promise.all([
    db.query.organizations.findFirst({ where: eq(organizations.id, caller.organizationId) }),
    loadMembers(),
    loadOrganizationsForCaller(),
  ]);

  return (
    <main className="mx-auto max-w-xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">Organization settings</h1>

      <OrgSwitcher
        organizations={memberOrganizations}
        activeOrganizationId={caller.organizationId}
      />

      <section className="space-y-2">
        <h2 className="font-medium">Name</h2>
        <form action={renameOrganizationAction} className="flex gap-2">
          <input name="name" defaultValue={org?.name} className="flex-1 rounded border p-2" />
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Save
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Join code</h2>
        <p className="text-2xl font-mono">{org?.joinCode}</p>
        {caller.role === "owner" && (
          <form action={rotateJoinCodeAction}>
            <button type="submit" className="rounded border px-3 py-2">
              Rotate code
            </button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Members</h2>
        <ul className="space-y-2">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between">
              <span>
                {member.name ?? member.email} — {member.role}
              </span>
              {caller.role === "owner" && member.userId !== caller.userId && (
                <form action={removeMemberAction}>
                  <input type="hidden" name="userId" value={member.userId} />
                  <button type="submit" className="text-sm text-red-600 underline">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <form action={leaveOrganizationAction}>
        <button type="submit" className="text-sm text-red-600 underline">
          Leave organization
        </button>
      </form>
    </main>
  );
}
