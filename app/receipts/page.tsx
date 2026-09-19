import Link from "next/link";
import { getReceipts } from "@/lib/db/queries";
import { formatDateLong, formatMoney } from "@/lib/format";

export const metadata = { title: "Receipts" };

export default async function ReceiptsPage() {
  const rows = await getReceipts();
  return (
    <main className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-newsreader)] text-4xl">Receipts</h1>
          <p className="mt-2 max-w-xl text-ink-soft">
            Scan a grocery ticket to record what you bought. Inventory is updated after you confirm the line items.
          </p>
        </div>
        <Link href="/receipts/new" className="inline-flex h-11 items-center bg-clementine px-4 font-medium text-white">
          Scan receipt
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="text-ink-soft">No receipts yet.</p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-tile">
          {rows.map((receipt) => (
            <li key={receipt.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">{receipt.store}</p>
                <p className="text-sm text-ink-soft">{formatDateLong(receipt.purchasedAt)}</p>
              </div>
              <p className="text-sm">{formatMoney(receipt.totalCents) ?? receipt.status}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
