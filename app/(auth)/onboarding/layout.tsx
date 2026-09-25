import { SessionRefreshProvider } from "./SessionRefreshProvider";

export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return <SessionRefreshProvider>{children}</SessionRefreshProvider>;
}
