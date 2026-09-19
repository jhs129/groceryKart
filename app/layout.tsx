import type { Metadata } from "next";
import { IBM_Plex_Sans, Newsreader } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const display = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-sans",
});

export const metadata: Metadata = {
  title: {
    default: "GroceryKart",
    template: "%s · GroceryKart",
  },
  description:
    "Household grocery inventory, receipt scanning, shopping lists, and use-it-before-it-rots reminders.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-full antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
