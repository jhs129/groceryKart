"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmReceipt, parseReceiptImage } from "@/app/actions/receipts";
import { CATEGORIES } from "@/lib/types";

type Line = {
  name: string;
  quantity: number;
  unit: string;
  price: number | null;
  category: string;
  addToInventory: boolean;
};

export function ReceiptScanner() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [total, setTotal] = useState<string>("");
  const [lines, setLines] = useState<Line[] | null>(null);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current
        ? current.map((line, lineIndex) =>
            lineIndex === index ? { ...line, ...patch } : line,
          )
        : current,
    );
  }

  return (
    <div className="grid gap-6">
      <form
        className="border border-line bg-tile p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          setError(null);
          start(async () => {
            const result = await parseReceiptImage(formData);
            if ("error" in result && result.error) {
              setError(result.error);
              return;
            }
            if (result.extracted) {
              setStore(result.extracted.store);
              setPurchasedAt(result.extracted.purchasedAt ?? new Date().toISOString().slice(0, 10));
              setTotal(result.extracted.total != null ? String(result.extracted.total) : "");
              setLines(
                result.extracted.items.map((item) => ({
                  ...item,
                  addToInventory: true,
                })),
              );
            }
          });
        }}
      >
        <label className="grid gap-2 text-sm">
          Receipt photo
          <input
            name="image"
            type="file"
            accept="image/*"
            capture="environment"
            required
            className="border border-line bg-paper px-3 py-2"
          />
        </label>
        <p className="mt-2 text-sm text-ink-soft">
          Take a photo at the store or upload a snapshot. Review the line items before they land in inventory.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="mt-4 h-11 bg-ink px-4 font-medium text-paper disabled:opacity-60"
        >
          {pending ? "Reading receipt…" : "Read receipt"}
        </button>
      </form>

      {error ? <p className="text-sm text-tomato">{error}</p> : null}

      {lines ? (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              const result = await confirmReceipt({
                store,
                purchasedAt,
                total: total ? Number(total) : null,
                items: lines,
              });
              if (result.ok) router.push("/receipts");
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              Store
              <input
                value={store}
                onChange={(event) => setStore(event.target.value)}
                className="h-10 border border-line bg-paper px-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Date
              <input
                type="date"
                value={purchasedAt}
                onChange={(event) => setPurchasedAt(event.target.value)}
                className="h-10 border border-line bg-paper px-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Total
              <input
                type="number"
                step="0.01"
                value={total}
                onChange={(event) => setTotal(event.target.value)}
                className="h-10 border border-line bg-paper px-3"
              />
            </label>
          </div>
          <ul className="divide-y divide-line border border-line bg-tile">
            {lines.map((line, index) => (
              <li key={`${line.name}-${index}`} className="grid gap-2 p-3 sm:grid-cols-[1fr_5rem_6rem_6rem_auto]">
                <input
                  value={line.name}
                  onChange={(event) => updateLine(index, { name: event.target.value })}
                  className="h-10 border border-line bg-paper px-3"
                />
                <input
                  type="number"
                  step="0.1"
                  value={line.quantity}
                  onChange={(event) =>
                    updateLine(index, { quantity: Number(event.target.value) })
                  }
                  className="h-10 border border-line bg-paper px-3"
                />
                <input
                  value={line.unit}
                  onChange={(event) => updateLine(index, { unit: event.target.value })}
                  className="h-10 border border-line bg-paper px-3"
                />
                <select
                  value={line.category}
                  onChange={(event) => updateLine(index, { category: event.target.value })}
                  className="h-10 border border-line bg-paper px-3"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={line.addToInventory}
                    onChange={(event) =>
                      updateLine(index, { addToInventory: event.target.checked })
                    }
                  />
                  On hand
                </label>
              </li>
            ))}
          </ul>
          <button
            type="submit"
            disabled={pending}
            className="h-11 bg-clementine px-4 font-medium text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Add purchases to the house"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
