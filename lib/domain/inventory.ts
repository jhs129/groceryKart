import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventoryLots, purchases } from "@/lib/db/schema";
import { findOrCreateItem } from "@/lib/matching";
import type { Caller } from "./caller";

export interface AddInventoryItemInput {
  name: string;
  category?: string;
  unit?: string;
  location?: string;
  perishable?: boolean;
  purchasedAt?: string;
  expiresAt?: string;
  quantity?: number;
  notes?: string;
  store?: string;
}

function parseDate(raw: string | undefined) {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function addInventoryItem(caller: Caller, input: AddInventoryItemInput): Promise<void> {
  const name = input.name.trim();
  if (!name) return;

  const item = await findOrCreateItem(caller.organizationId, {
    name,
    category: input.category ?? "other",
    unit: input.unit ?? "each",
    location: input.location ?? "pantry",
    perishable: input.perishable ?? false,
  });
  if (!item) return;

  const purchasedAt = parseDate(input.purchasedAt) ?? new Date();
  const expiresAt = parseDate(input.expiresAt);
  const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const unit = input.unit ?? item.defaultUnit;
  const location = input.location ?? item.defaultLocation;

  await db.insert(inventoryLots).values({
    organizationId: caller.organizationId,
    itemId: item.id,
    quantity,
    unit,
    location,
    purchasedAt,
    expiresAt:
      expiresAt ??
      (item.typicalShelfLifeDays
        ? new Date(purchasedAt.getTime() + item.typicalShelfLifeDays * 86_400_000)
        : null),
    notes: input.notes?.trim() || null,
    status: "on_hand",
  });

  await db.insert(purchases).values({
    organizationId: caller.organizationId,
    itemId: item.id,
    quantity,
    unit,
    purchasedAt,
    store: input.store?.trim() || "Manual add",
    rawName: name,
  });
}

export async function adjustLotQuantity(caller: Caller, lotId: string, nextQuantity: number): Promise<void> {
  const quantity = Math.max(0, nextQuantity);
  await db
    .update(inventoryLots)
    .set({
      quantity,
      status: quantity <= 0 ? "used_up" : "on_hand",
      updatedAt: new Date(),
    })
    .where(and(eq(inventoryLots.id, lotId), eq(inventoryLots.organizationId, caller.organizationId)));
}

export async function markLotGone(
  caller: Caller,
  lotId: string,
  status: "used_up" | "discarded",
): Promise<void> {
  await db
    .update(inventoryLots)
    .set({ quantity: 0, status, updatedAt: new Date() })
    .where(and(eq(inventoryLots.id, lotId), eq(inventoryLots.organizationId, caller.organizationId)));
}
