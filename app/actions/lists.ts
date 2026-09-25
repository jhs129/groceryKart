"use server";

import { revalidatePath } from "next/cache";
import { resolveCaller } from "@/app/actions/organizations";
import {
  addListItem as addListItemDomain,
  createShoppingList as createShoppingListDomain,
  toggleListItem as toggleListItemDomain,
  addMissingIngredientsToList as addMissingIngredientsToListDomain,
} from "@/lib/domain/lists";

export async function addListItem(formData: FormData) {
  const caller = await resolveCaller();
  const listId = String(formData.get("listId") ?? "");
  const resultListId = await addListItemDomain(caller, {
    name: String(formData.get("name") ?? ""),
    listId: listId || undefined,
    quantity: Number(formData.get("quantity") ?? 1) || 1,
    unit: String(formData.get("unit") ?? "") || undefined,
    reason: String(formData.get("reason") ?? "manual") || undefined,
  });
  revalidatePath("/lists");
  if (resultListId) revalidatePath(`/lists/${resultListId}`);
}

export async function toggleListItem(id: string, checked: boolean) {
  const caller = await resolveCaller();
  await toggleListItemDomain(caller, id, checked);
  revalidatePath("/lists");
}

export async function createShoppingList(formData: FormData) {
  const caller = await resolveCaller();
  const id = await createShoppingListDomain(caller, String(formData.get("name") ?? ""));
  revalidatePath("/lists");
  return id;
}

export async function addMissingIngredientsToList(
  ingredients: { name: string; quantity: number | null; unit: string | null }[],
) {
  const caller = await resolveCaller();
  const listId = await addMissingIngredientsToListDomain(caller, ingredients);
  revalidatePath("/lists");
  revalidatePath("/recipes");
  return listId;
}
