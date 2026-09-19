"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { inventoryLots, purchases } from "@/lib/db/schema";
import { findOrCreateItem } from "@/lib/matching";
import { eq } from "drizzle-orm";

function formNumber(formData: FormData, key: string, fallback = 1) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formDate(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function addInventoryItem(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const item = await findOrCreateItem({
    name,
    category: String(formData.get("category") ?? "other"),
    unit: String(formData.get("unit") ?? "each"),
    location: String(formData.get("location") ?? "pantry"),
    perishable: formData.get("perishable") === "on",
  });
  if (!item) return;

  const purchasedAt = formDate(formData, "purchasedAt") ?? new Date();
  const expiresAt = formDate(formData, "expiresAt");
  const quantity = formNumber(formData, "quantity");
  const unit = String(formData.get("unit") ?? item.defaultUnit);
  const location = String(formData.get("location") ?? item.defaultLocation);

  await db.insert(inventoryLots).values({
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
    notes: String(formData.get("notes") ?? "").trim() || null,
    status: "on_hand",
  });

  await db.insert(purchases).values({
    itemId: item.id,
    quantity,
    unit,
    purchasedAt,
    store: String(formData.get("store") ?? "").trim() || "Manual add",
    rawName: name,
  });

  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/ask");
}

export async function adjustLotQuantity(lotId: string, nextQuantity: number) {
  const quantity = Math.max(0, nextQuantity);
  await db
    .update(inventoryLots)
    .set({
      quantity,
      status: quantity <= 0 ? "used_up" : "on_hand",
      updatedAt: new Date(),
    })
    .where(eq(inventoryLots.id, lotId));
  revalidatePath("/");
  revalidatePath("/inventory");
}

export async function markLotGone(lotId: string, status: "used_up" | "discarded") {
  await db
    .update(inventoryLots)
    .set({ quantity: 0, status, updatedAt: new Date() })
    .where(eq(inventoryLots.id, lotId));
  revalidatePath("/");
  revalidatePath("/inventory");
}
