"use server";

import { auth } from "@/lib/auth";
import { createOrganization, joinOrganizationByCode } from "@/lib/domain/organizations";

export interface OnboardingActionState {
  error?: string;
}

export async function createOrganizationAction(
  prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in." };
  }
  const name = String(formData.get("name") ?? "");
  await createOrganization(session.user.id, name);
  return {};
}

export async function joinOrganizationAction(
  prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in." };
  }
  const joinCode = String(formData.get("joinCode") ?? "");
  try {
    await joinOrganizationByCode(session.user.id, joinCode);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not join that organization.",
    };
  }
  return {};
}
