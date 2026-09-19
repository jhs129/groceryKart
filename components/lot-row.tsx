"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { adjustLotQuantity, markLotGone } from "@/app/actions/inventory";
import { expiryTone, formatDate, formatDaysAway, formatQty } from "@/lib/format";

type Lot = {
  id: string;
  quantity: number;
  unit: string;
  location: string;
  purchasedAt: Date | string | null;
  expiresAt: Date | string | null;
};

export function LotRow({
  itemName,
  category,
  lot,
}: {
  itemName: string;
  category: string;
  lot: Lot;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const tone = expiryTone(lot.expiresAt);
  const toneClass =
    tone === "overdue"
      ? "text-tomato"
      : tone === "today" || tone === "soon"
        ? "text-banana"
        : "text-ink-soft";

  return (
    <article className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-line py-3">
      <div>
        <h3 className="font-medium text-ink">{itemName}</h3>
        <p className="mt-0.5 text-sm text-ink-soft">
          {formatQty(lot.quantity, lot.unit)} · {lot.location} · {category}
        </p>
        <p className={`mt-1 text-sm ${toneClass}`}>
          {lot.expiresAt
            ? `Use by ${formatDate(lot.expiresAt)} (${formatDaysAway(lot.expiresAt)})`
            : "No expiry on file"}
          {lot.purchasedAt ? ` · bought ${formatDate(lot.purchasedAt)}` : ""}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={pending}
            className="h-8 w-8 border border-line bg-tile text-lg"
            onClick={() =>
              start(async () => {
                await adjustLotQuantity(lot.id, lot.quantity - 1);
                router.refresh();
              })
            }
            aria-label={`Decrease ${itemName}`}
          >
            −
          </button>
          <button
            type="button"
            disabled={pending}
            className="h-8 w-8 border border-line bg-tile text-lg"
            onClick={() =>
              start(async () => {
                await adjustLotQuantity(lot.id, lot.quantity + 1);
                router.refresh();
              })
            }
            aria-label={`Increase ${itemName}`}
          >
            +
          </button>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            className="text-ink-soft underline"
            onClick={() =>
              start(async () => {
                await markLotGone(lot.id, "used_up");
                router.refresh();
              })
            }
          >
            Used up
          </button>
          <button
            type="button"
            className="text-tomato underline"
            onClick={() =>
              start(async () => {
                await markLotGone(lot.id, "discarded");
                router.refresh();
              })
            }
          >
            Tossed
          </button>
        </div>
      </div>
    </article>
  );
}
