import { InventoryForm } from "@/components/inventory-form";
import { LotRow } from "@/components/lot-row";
import { resolveCaller } from "@/app/actions/organizations";
import { getOnHandLots } from "@/lib/db/queries";

export const metadata = { title: "On hand" };

export default async function InventoryPage() {
  const caller = await resolveCaller();
  const lots = await getOnHandLots(caller.organizationId);
  const grouped = new Map<string, typeof lots>();
  for (const row of lots) {
    const bucket = grouped.get(row.lot.location) ?? [];
    bucket.push(row);
    grouped.set(row.lot.location, bucket);
  }

  return (
    <main className="grid gap-8">
      <header>
        <h1 className="font-[family-name:var(--font-newsreader)] text-4xl">On hand</h1>
        <p className="mt-2 max-w-xl text-ink-soft">
          This is what the house thinks it still has. Mark things used up as you finish them so the reminders stay honest.
        </p>
      </header>
      <InventoryForm />
      {lots.length === 0 ? (
        <p className="text-ink-soft">Nothing on hand yet. Add items or scan a receipt.</p>
      ) : (
        ["fridge", "freezer", "pantry", "counter"].map((location) => {
          const rows = grouped.get(location) ?? [];
          if (rows.length === 0) return null;
          return (
            <section key={location}>
              <h2 className="font-[family-name:var(--font-newsreader)] text-2xl capitalize">{location}</h2>
              <div className="mt-2">
                {rows.map(({ item, lot }) => (
                  <LotRow
                    key={lot.id}
                    itemName={item.name}
                    category={item.category}
                    lot={lot}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
