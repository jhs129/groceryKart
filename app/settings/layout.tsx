import { SettingsSessionProvider } from "./SettingsSessionProvider";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return <SettingsSessionProvider>{children}</SettingsSessionProvider>;
}
