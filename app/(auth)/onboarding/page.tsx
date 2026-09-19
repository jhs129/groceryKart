import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OnboardingForms } from "./OnboardingForms";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  if (session.user.activeOrganizationId) redirect("/");

  return (
    <main className="mx-auto max-w-sm space-y-6 p-6">
      <h1 className="text-xl font-semibold">Set up your household</h1>
      <OnboardingForms />
    </main>
  );
}
