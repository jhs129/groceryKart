import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getOrCreateDefaultList } from "@/lib/db/queries";
import { shoppingListItems, shoppingLists } from "@/lib/db/schema";
import { findOrCreateItem } from "@/lib/matching";
import type { Caller } from "./caller";

export interface AddListItemInput {
  name: string;
  listId?: string;
  quantity?: number;
  unit?: string;
  reason?: string;
}

export async function addListItem(caller: Caller, input: AddListItemInput): Promise<string | null> {
  const name = input.name.trim();
  if (!name) return null;

  const list = input.listId
    ? { id: input.listId }
    : await getOrCreateDefaultList(caller.organizationId);

  const item = await findOrCreateItem(caller.organizationId, { name });
  await db.insert(shoppingListItems).values({
    listId: list.id,
    itemId: item?.id ?? null,
    name: item?.name ?? name,
    quantity: input.quantity && input.quantity > 0 ? input.quantity : 1,
    unit: input.unit ?? item?.defaultUnit ?? "each",
    reason: input.reason ?? "manual",
  });
  return list.id;
}

export async function toggleListItem(caller: Caller, id: string, checked: boolean): Promise<void> {
  const row = await db.query.shoppingListItems.findFirst({
    where: eq(shoppingListItems.id, id),
    with: { list: true },
  });
  if (!row || row.list.organizationId !== caller.organizationId) return;
  await db.update(shoppingListItems).set({ checked }).where(eq(shoppingListItems.id, id));
}

export async function createShoppingList(caller: Caller, name: string): Promise<string> {
  const trimmedName = name.trim() || "Shopping list";
  const [list] = await db
    .insert(shoppingLists)
    .values({ organizationId: caller.organizationId, name: trimmedName })
    .returning();
  return list.id;
}

export async function addMissingIngredientsToList(
  caller: Caller,
  ingredients: { name: string; quantity: number | null; unit: string | null }[],
): Promise<string> {
  const list = await getOrCreateDefaultList(caller.organizationId);
  for (const ingredient of ingredients) {
    const item = await findOrCreateItem(caller.organizationId, { name: ingredient.name });
    await db.insert(shoppingListItems).values({
      listId: list.id,
      itemId: item?.id ?? null,
      name: item?.name ?? ingredient.name,
      quantity: ingredient.quantity ?? 1,
      unit: ingredient.unit ?? item?.defaultUnit ?? "each",
      reason: "recipe",
    });
  }
  return list.id;
}
