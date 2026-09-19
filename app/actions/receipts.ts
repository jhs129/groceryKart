"use server";

import { revalidatePath } from "next/cache";
import { extractReceipt } from "@/lib/ai";
import { db } from "@/lib/db";
import { inventoryLots, purchases, receiptLines, receipts } from "@/lib/db/schema";
import { findOrCreateItem } from "@/lib/matching";

export type ExtractedReceipt = Awaited<ReturnType<typeof extractReceipt>>;

export async function parseReceiptImage(formData: FormData) {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Add a photo of the receipt first." };
  }
  if (file.size > 8_000_000) {
    return { error: "Keep the photo under 8MB." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const imageDataUrl = `data:${file.type || "image/jpeg"};base64,${bytes.toString("base64")}`;

  try {
    const extracted = await extractReceipt(imageDataUrl);
    return { extracted };
  } catch (error) {
    console.error(error);
    return {
      error:
        "Could not read that receipt. Check AI Gateway access, then try a sharper photo.",
    };
  }
}

export async function confirmReceipt(input: {
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
}) {
  const purchasedAt = input.purchasedAt ? new Date(input.purchasedAt) : new Date();
  const [receipt] = await db
    .insert(receipts)
    .values({
      store: input.store || "Unknown store",
      purchasedAt,
      totalCents: input.total != null ? Math.round(input.total * 100) : null,
      status: "confirmed",
    })
    .returning();

  for (const line of input.items) {
    if (!line.name.trim()) continue;
    const item = await findOrCreateItem({
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

  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/receipts");
  revalidatePath("/ask");
  return { ok: true, receiptId: receipt.id };
}
