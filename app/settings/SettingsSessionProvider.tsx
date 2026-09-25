"use client";

import { SessionProvider } from "next-auth/react";

export interface SettingsSessionProviderProps {
  children: React.ReactNode;
}

// R24: scoped to /settings only (mirrors app/(auth)/onboarding's provider).
// Gives the org switcher's `useSession().update()` call somewhere to run —
// the root layout doesn't wrap the app in a SessionProvider, so this is
// needed wherever a client component calls useSession().
export function SettingsSessionProvider({ children }: SettingsSessionProviderProps) {
  return <SessionProvider>{children}</SessionProvider>;
}
