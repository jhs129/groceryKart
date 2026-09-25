import Link from "next/link";
import { signOut } from "@/lib/auth";

const links = [
  { href: "/", label: "House" },
  { href: "/inventory", label: "On hand" },
  { href: "/receipts", label: "Receipts" },
  { href: "/lists", label: "Kart" },
  { href: "/recipes", label: "Cook" },
  { href: "/ask", label: "Do we have" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-10 lg:pb-10">
      <header className="mb-6 flex items-end justify-between gap-4 lg:mb-0 lg:block">
        <Link href="/" className="block">
          <p className="font-[family-name:var(--font-newsreader)] text-3xl leading-none tracking-tight text-ink">
            GroceryKart
          </p>
          <p className="mt-1 text-sm text-ink-soft">What’s in the house</p>
        </Link>
        <nav
          aria-label="Primary"
          className="hidden lg:mt-10 lg:flex lg:flex-col lg:gap-1"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-sm px-2 py-2 text-[15px] text-ink hover:bg-tile"
            >
              {link.label}
            </Link>
          ))}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-sm px-2 py-2 text-left text-[15px] text-ink hover:bg-tile"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <div className="min-w-0">{children}</div>
      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-6xl grid-cols-8 text-center text-[11px]">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="block px-1 py-3 text-ink">
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button type="submit" className="block w-full px-1 py-3 text-ink">
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </div>
  );
}
