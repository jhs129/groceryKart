import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrganizationForUser } from "@/lib/domain/organizations";
import { OnboardingForms } from "./OnboardingForms";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  if (session.user.activeOrganizationId) {
    // Re-check current membership rather than trusting the JWT claim, so a
    // removed member's still-valid session lands here instead of bouncing
    // back to "/" (which would redirect here again, looping forever).
    const membership = await getOrganizationForUser(session.user.id, session.user.activeOrganizationId);
    if (membership) redirect("/");
  }

  return (
    <main className="mx-auto max-w-sm space-y-6 p-6">
      <h1 className="text-xl font-semibold">Set up your household</h1>
      <OnboardingForms />
    </main>
  );
}
