"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import type { Caller } from "@/lib/domain/caller";
import {
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
  return {
    userId: session.user.id,
    organizationId: session.user.activeOrganizationId,
    role: session.user.role,
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

// R24: switches the caller's active organization. This only updates the
// database (`users.activeOrganizationId`) — it does not touch the session
// cookie, since server actions cannot rewrite the JWT directly. The client
// caller (components/org-switcher.tsx) must follow a successful call with
// next-auth/react's `useSession().update()` to refresh the session, the same
// pattern Task 6's onboarding flow uses.
export async function switchOrganizationAction(
  prevState: SwitchOrganizationState,
  formData: FormData,
): Promise<SwitchOrganizationState> {
  const caller = await resolveCaller();
  const organizationId = String(formData.get("organizationId") ?? "");
  try {
    await switchActiveOrganization(caller.userId, organizationId);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not switch organizations.",
    };
  }
  revalidatePath("/settings");
  return {};
}
