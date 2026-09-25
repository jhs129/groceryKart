import Link from "next/link";
import { AskForm } from "@/components/ask-form";
import { resolveCaller } from "@/app/actions/organizations";
import { getExpiringLots, getInventorySummary, getOpenLists } from "@/lib/db/queries";
import { expiryTone, formatDaysAway, formatQty } from "@/lib/format";

export default async function HomePage() {
  const caller = await resolveCaller();
  const [{ lots, totalLots, byLocation }, expiring, lists] = await Promise.all([
    getInventorySummary(caller.organizationId),
    getExpiringLots(caller.organizationId, 4),
    getOpenLists(caller.organizationId),
  ]);
  const kart = lists[0];

  return (
    <main className="grid gap-10">
      <section>
        <h1 className="font-[family-name:var(--font-newsreader)] text-4xl leading-tight sm:text-5xl">
          Cook what’s already here, before it turns.
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-soft">
          GroceryKart remembers what you bought, estimates what’s still in the fridge, and nags you about the spinach.
        </p>
      </section>

      <AskForm />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-[family-name:var(--font-newsreader)] text-2xl">Use soon</h2>
          <Link href="/inventory" className="text-sm text-clementine">
            Full pantry
          </Link>
        </div>
        {expiring.length === 0 ? (
          <p className="border border-dashed border-line px-4 py-6 text-ink-soft">
            Nothing is about to rot. Add perishables or scan a receipt to start the clock.
          </p>
        ) : (
          <ul className="grid gap-2">
            {expiring.map(({ item, lot }) => {
              const tone = expiryTone(lot.expiresAt);
              return (
                <li
                  key={lot.id}
                  className="flex items-center justify-between border-l-4 bg-tile px-4 py-3"
                  style={{
                    borderLeftColor:
                      tone === "overdue" || tone === "today"
                        ? "var(--tomato)"
                        : "var(--banana)",
                  }}
                >
                  <span>
                    <span className="font-medium">{item.name}</span>
                    <span className="text-ink-soft">
                      {" "}
                      · {formatQty(lot.quantity, lot.unit)} · {lot.location}
                    </span>
                  </span>
                  <span className="text-sm">{formatDaysAway(lot.expiresAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Lots on hand" value={String(totalLots)} href="/inventory" />
        <Stat
          label="Fridge / freezer / pantry"
          value={`${byLocation.get("fridge") ?? 0} / ${byLocation.get("freezer") ?? 0} / ${byLocation.get("pantry") ?? 0}`}
          href="/inventory"
        />
        <Stat
          label={kart ? kart.name : "Kart"}
          value={kart ? "Open list" : "Start a list"}
          href={kart ? `/lists/${kart.id}` : "/lists"}
        />
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href="/receipts/new" className="inline-flex h-11 items-center bg-clementine px-4 font-medium text-white">
          Scan a receipt
        </Link>
        <Link href="/recipes" className="inline-flex h-11 items-center border border-line px-4">
          Cook from on hand
        </Link>
        <Link href="/inventory" className="inline-flex h-11 items-center border border-line px-4">
          Add something we already have
        </Link>
      </section>

      {lots.length > 0 ? (
        <p className="text-sm text-ink-soft">
          {lots.length} lots are marked on hand. That is a belief, not a guarantee — GroceryKart cannot see the leftovers.
        </p>
      ) : null}
    </main>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href} className="border border-line bg-tile p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-newsreader)] text-2xl">{value}</p>
    </Link>
  );
}
