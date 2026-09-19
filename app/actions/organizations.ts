"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, unstable_update } from "@/lib/auth";
import type { Caller } from "@/lib/domain/caller";
import {
  getOrganizationForUser,
  listMembers,
  listOrganizationsForUser,
  removeMember,
  renameOrganization,
  rotateJoinCode,
  leaveOrganization,
  switchActiveOrganization,
} from "@/lib/domain/organizations";

export async function resolveCaller(): Promise<Caller> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  if (!session.user.activeOrganizationId || !session.user.role) redirect("/onboarding");

  // Re-check current membership/role rather than trusting the JWT claims,
  // so a removed member's still-valid session is rejected (mirrors
  // lib/api/auth.ts's authenticateRequest for the REST/MCP paths).
  const membership = await getOrganizationForUser(session.user.id, session.user.activeOrganizationId);
  if (!membership) redirect("/onboarding");

  return {
    userId: session.user.id,
    organizationId: session.user.activeOrganizationId,
    role: membership.role,
  };
}

export async function rotateJoinCodeAction() {
  const caller = await resolveCaller();
  await rotateJoinCode(caller);
  revalidatePath("/settings");
}

export async function renameOrganizationAction(formData: FormData) {
  const caller = await resolveCaller();
  await renameOrganization(caller, String(formData.get("name") ?? ""));
  revalidatePath("/settings");
}

export async function removeMemberAction(formData: FormData) {
  const caller = await resolveCaller();
  await removeMember(caller, String(formData.get("userId") ?? ""));
  revalidatePath("/settings");
}

export async function leaveOrganizationAction() {
  const caller = await resolveCaller();
  await leaveOrganization(caller);
  redirect("/onboarding");
}

export async function loadMembers() {
  const caller = await resolveCaller();
  return listMembers(caller);
}

// R24: lists every organization the signed-in user belongs to, so the
// settings page can decide whether to show an organization switcher at all
// (only relevant when there is more than one).
export async function loadOrganizationsForCaller() {
  const caller = await resolveCaller();
  return listOrganizationsForUser(caller.userId);
}

export interface SwitchOrganizationState {
  error?: string;
}

// R24/R35: switches the caller's active organization. This updates the
// database (`users.activeOrganizationId`) and then calls next-auth's
// `unstable_update()` server-side (available here because this runs inside a
// Server Action, which has cookie-write access) so the session cookie's
// `activeOrganizationId`/`role` are refreshed before this action returns —
// this triggers lib/auth.ts's `jwt` callback with `trigger === "update"`,
// which re-reads the membership from the DB. R35 found that driving the
// same refresh from the client via `useSession().update()` did not reliably
// update the cookie on the installed next-auth beta; doing it server-side
// here avoids that round trip entirely.
export async function switchOrganizationAction(
  prevState: SwitchOrganizationState,
  formData: FormData,
): Promise<SwitchOrganizationState> {
  const caller = await resolveCaller();
  const organizationId = String(formData.get("organizationId") ?? "");
  try {
    await switchActiveOrganization(caller.userId, organizationId);
    await unstable_update({});
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not switch organizations.",
    };
  }
  revalidatePath("/settings");
  return {};
}
