"use client";

import { SessionProvider } from "next-auth/react";

export interface SessionRefreshProviderProps {
  children: React.ReactNode;
}

// R10: scoped to the onboarding route only, so it doesn't touch the global
// layout. Provides the `useSession().update()` client hook that
// OnboardingForms needs to force a fresh JWT after creating/joining an
// organization (see OnboardingForms.tsx for why a plain redirect isn't enough).
export function SessionRefreshProvider({ children }: SessionRefreshProviderProps) {
  return <SessionProvider>{children}</SessionProvider>;
}
