"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getOrCreateDefaultList } from "@/lib/db/queries";
import { shoppingListItems, shoppingLists } from "@/lib/db/schema";
import { findOrCreateItem } from "@/lib/matching";
import { eq } from "drizzle-orm";

export async function addListItem(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const listId = String(formData.get("listId") ?? "");
  const list = listId
    ? { id: listId }
    : await getOrCreateDefaultList();

  const item = await findOrCreateItem({ name });
  await db.insert(shoppingListItems).values({
    listId: list.id,
    itemId: item?.id ?? null,
    name: item?.name ?? name,
    quantity: Number(formData.get("quantity") ?? 1) || 1,
    unit: String(formData.get("unit") ?? item?.defaultUnit ?? "each"),
    reason: String(formData.get("reason") ?? "manual"),
  });
  revalidatePath("/lists");
  revalidatePath(`/lists/${list.id}`);
}

export async function toggleListItem(id: string, checked: boolean) {
  await db
    .update(shoppingListItems)
    .set({ checked })
    .where(eq(shoppingListItems.id, id));
  revalidatePath("/lists");
}

export async function createShoppingList(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || "Shopping list";
  const [list] = await db.insert(shoppingLists).values({ name }).returning();
  revalidatePath("/lists");
  return list.id;
}

export async function addMissingIngredientsToList(
  ingredients: { name: string; quantity: number | null; unit: string | null }[],
) {
  const list = await getOrCreateDefaultList();
  for (const ingredient of ingredients) {
    const item = await findOrCreateItem({ name: ingredient.name });
    await db.insert(shoppingListItems).values({
      listId: list.id,
      itemId: item?.id ?? null,
      name: item?.name ?? ingredient.name,
      quantity: ingredient.quantity ?? 1,
      unit: ingredient.unit ?? item?.defaultUnit ?? "each",
      reason: "recipe",
    });
  }
  revalidatePath("/lists");
  revalidatePath("/recipes");
  return list.id;
}
