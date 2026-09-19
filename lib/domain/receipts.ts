import { extractReceipt } from "@/lib/ai";
import { db } from "@/lib/db";
import { inventoryLots, purchases, receiptLines, receipts } from "@/lib/db/schema";
import { findOrCreateItem } from "@/lib/matching";
import type { Category } from "@/lib/types";
import type { Caller } from "./caller";

export interface ExtractedReceipt {
  store: string;
  purchasedAt: string | null;
  total: number | null;
  items: {
    name: string;
    quantity: number;
    unit: string;
    price: number | null;
    category: Category;
  }[];
}

export async function parseReceiptImage(
  imageDataUrl: string,
): Promise<{ extracted?: ExtractedReceipt; error?: string }> {
  try {
    const extracted = await extractReceipt(imageDataUrl);
    return { extracted };
  } catch (error) {
    console.error(error);
    return {
      error: "Could not read that receipt. Check AI Gateway access, then try a sharper photo.",
    };
  }
}

export interface ConfirmReceiptInput {
  store: string;
  purchasedAt: string;
  total: number | null;
  items: {
    name: string;
    quantity: number;
    unit: string;
    price: number | null;
    category: string;
    addToInventory: boolean;
  }[];
}

export async function confirmReceipt(
  caller: Caller,
  input: ConfirmReceiptInput,
): Promise<{ receiptId: string }> {
  const purchasedAt = input.purchasedAt ? new Date(input.purchasedAt) : new Date();
  const [receipt] = await db
    .insert(receipts)
    .values({
      organizationId: caller.organizationId,
      store: input.store || "Unknown store",
      purchasedAt,
      totalCents: input.total != null ? Math.round(input.total * 100) : null,
      status: "confirmed",
    })
    .returning();

  for (const line of input.items) {
    if (!line.name.trim()) continue;
    const item = await findOrCreateItem(caller.organizationId, {
      name: line.name,
      category: line.category,
      unit: line.unit,
    });
    if (!item) continue;

    await db.insert(receiptLines).values({
      receiptId: receipt.id,
      rawName: line.name,
      itemId: item.id,
      quantity: line.quantity,
      unit: line.unit,
      priceCents: line.price != null ? Math.round(line.price * 100) : null,
      category: line.category,
      addedToInventory: line.addToInventory,
    });

    await db.insert(purchases).values({
      organizationId: caller.organizationId,
      itemId: item.id,
      quantity: line.quantity,
      unit: line.unit,
      purchasedAt,
      store: input.store,
      receiptId: receipt.id,
      rawName: line.name,
    });

    if (line.addToInventory) {
      await db.insert(inventoryLots).values({
        organizationId: caller.organizationId,
        itemId: item.id,
        quantity: line.quantity,
        unit: line.unit,
        location: item.defaultLocation,
        purchasedAt,
        expiresAt: item.typicalShelfLifeDays
          ? new Date(purchasedAt.getTime() + item.typicalShelfLifeDays * 86_400_000)
          : null,
        receiptId: receipt.id,
        status: "on_hand",
      });
    }
  }

  return { receiptId: receipt.id };
}
