import { ReceiptScanner } from "@/components/receipt-scanner";

export const metadata = { title: "Scan receipt" };

export default function NewReceiptPage() {
  return (
    <main className="grid gap-6">
      <header>
        <h1 className="font-[family-name:var(--font-newsreader)] text-4xl">Scan a receipt</h1>
        <p className="mt-2 max-w-xl text-ink-soft">
          GroceryKart reads the ticket, then you confirm. Purchases are facts. Inventory is only a guess until you mark food used.
        </p>
      </header>
      <ReceiptScanner />
    </main>
  );
}
