"use server";

import { revalidatePath } from "next/cache";
import { resolveCaller } from "@/app/actions/organizations";
import {
  addInventoryItem as addInventoryItemDomain,
  adjustLotQuantity as adjustLotQuantityDomain,
  markLotGone as markLotGoneDomain,
} from "@/lib/domain/inventory";

export async function addInventoryItem(formData: FormData) {
  const caller = await resolveCaller();
  await addInventoryItemDomain(caller, {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "other"),
    unit: String(formData.get("unit") ?? "each"),
    location: String(formData.get("location") ?? "pantry"),
    perishable: formData.get("perishable") === "on",
    purchasedAt: String(formData.get("purchasedAt") ?? ""),
    expiresAt: String(formData.get("expiresAt") ?? ""),
    quantity: Number(formData.get("quantity") ?? 1) || 1,
    notes: String(formData.get("notes") ?? ""),
    store: String(formData.get("store") ?? ""),
  });
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/ask");
}

export async function adjustLotQuantity(lotId: string, nextQuantity: number) {
  const caller = await resolveCaller();
  await adjustLotQuantityDomain(caller, lotId, nextQuantity);
  revalidatePath("/");
  revalidatePath("/inventory");
}

export async function markLotGone(lotId: string, status: "used_up" | "discarded") {
  const caller = await resolveCaller();
  await markLotGoneDomain(caller, lotId, status);
  revalidatePath("/");
  revalidatePath("/inventory");
}
