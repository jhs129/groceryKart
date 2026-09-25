"use server";

import { revalidatePath } from "next/cache";
import { resolveCaller } from "@/app/actions/organizations";
import {
  parseReceiptImage as parseReceiptImageDomain,
  confirmReceipt as confirmReceiptDomain,
  type ExtractedReceipt,
} from "@/lib/domain/receipts";

export type { ExtractedReceipt };

export async function parseReceiptImage(formData: FormData) {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Add a photo of the receipt first." };
  }
  if (file.size > 8_000_000) {
    return { error: "Keep the photo under 8MB." };
  }
  await resolveCaller();
  const bytes = Buffer.from(await file.arrayBuffer());
  const imageDataUrl = `data:${file.type || "image/jpeg"};base64,${bytes.toString("base64")}`;
  return parseReceiptImageDomain(imageDataUrl);
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
  const caller = await resolveCaller();
  const result = await confirmReceiptDomain(caller, input);
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/receipts");
  revalidatePath("/ask");
  return { ok: true, receiptId: result.receiptId };
}
