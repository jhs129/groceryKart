"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { addListItem, toggleListItem } from "@/app/actions/lists";

type ListItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  reason: string;
};

export function ListEditor({
  listId,
  items,
}: {
  listId: string;
  items: ListItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-6">
      <form action={addListItem} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="listId" value={listId} />
        <input
          name="name"
          required
          placeholder="Coffee, lemons, paper towels"
          className="h-11 flex-1 border border-line bg-paper px-3"
        />
        <input
          name="quantity"
          type="number"
          min="0.1"
          step="0.1"
          defaultValue="1"
          className="h-11 w-24 border border-line bg-paper px-3"
        />
        <button type="submit" className="h-11 bg-clementine px-4 font-medium text-white">
          Add to kart
        </button>
      </form>
      {items.length === 0 ? (
        <p className="text-ink-soft">This list is empty. Add what the house is out of.</p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-tile">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-3">
              <input
                type="checkbox"
                checked={item.checked}
                disabled={pending}
                onChange={(event) =>
                  start(async () => {
                    await toggleListItem(item.id, event.target.checked);
                    router.refresh();
                  })
                }
                className="size-5 accent-herb"
              />
              <div className={item.checked ? "text-ink-soft line-through" : ""}>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-ink-soft">
                  {item.quantity} {item.unit}
                  {item.reason !== "manual" ? ` · ${item.reason.replaceAll("_", " ")}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
