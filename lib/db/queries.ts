import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "./index";
import {
  inventoryLots,
  items,
  purchases,
  receiptLines,
  receipts,
  recipeIngredients,
  recipes,
  shoppingListItems,
  shoppingLists,
} from "./schema";

export async function getOnHandLots() {
  return db
    .select({
      lot: inventoryLots,
      item: items,
    })
    .from(inventoryLots)
    .innerJoin(items, eq(items.id, inventoryLots.itemId))
    .where(and(eq(inventoryLots.status, "on_hand"), sql`${inventoryLots.quantity} > 0`))
    .orderBy(inventoryLots.expiresAt, items.name);
}

export async function getExpiringLots(withinDays = 4) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  return db
    .select({
      lot: inventoryLots,
      item: items,
    })
    .from(inventoryLots)
    .innerJoin(items, eq(items.id, inventoryLots.itemId))
    .where(
      and(
        eq(inventoryLots.status, "on_hand"),
        sql`${inventoryLots.quantity} > 0`,
        isNotNull(inventoryLots.expiresAt),
        lte(inventoryLots.expiresAt, cutoff),
      ),
    )
    .orderBy(inventoryLots.expiresAt);
}

export async function getInventorySummary() {
  const lots = await getOnHandLots();
  const byLocation = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const row of lots) {
    byLocation.set(row.lot.location, (byLocation.get(row.lot.location) ?? 0) + 1);
    byCategory.set(row.item.category, (byCategory.get(row.item.category) ?? 0) + 1);
  }
  return { lots, totalLots: lots.length, byLocation, byCategory };
}

export async function getRecentPurchases(days = 21) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return db
    .select({
      purchase: purchases,
      item: items,
    })
    .from(purchases)
    .innerJoin(items, eq(items.id, purchases.itemId))
    .where(gte(purchases.purchasedAt, since))
    .orderBy(desc(purchases.purchasedAt));
}

export async function getLastPurchaseForItem(itemId: string) {
  const [row] = await db
    .select()
    .from(purchases)
    .where(eq(purchases.itemId, itemId))
    .orderBy(desc(purchases.purchasedAt))
    .limit(1);
  return row ?? null;
}

export async function getReceipts() {
  return db.select().from(receipts).orderBy(desc(receipts.purchasedAt));
}

export async function getReceiptWithLines(id: string) {
  const receipt = await db.query.receipts.findFirst({
    where: eq(receipts.id, id),
  });
  if (!receipt) return null;
  const lines = await db
    .select({
      line: receiptLines,
      item: items,
    })
    .from(receiptLines)
    .leftJoin(items, eq(items.id, receiptLines.itemId))
    .where(eq(receiptLines.receiptId, id));
  return { receipt, lines };
}

export async function getOpenLists() {
  return db
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.status, "open"))
    .orderBy(desc(shoppingLists.createdAt));
}

export async function getListWithItems(id: string) {
  const list = await db.query.shoppingLists.findFirst({
    where: eq(shoppingLists.id, id),
  });
  if (!list) return null;
  const listItems = await db
    .select({
      row: shoppingListItems,
      item: items,
    })
    .from(shoppingListItems)
    .leftJoin(items, eq(items.id, shoppingListItems.itemId))
    .where(eq(shoppingListItems.listId, id));
  return { list, items: listItems };
}

export async function getOrCreateDefaultList() {
  const existing = await db.query.shoppingLists.findFirst({
    where: eq(shoppingLists.status, "open"),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(shoppingLists)
    .values({ name: "This week's kart" })
    .returning();
  return created;
}

export async function getRecipes() {
  const all = await db.select().from(recipes).orderBy(desc(recipes.createdAt));
  const ingredients = await db.select().from(recipeIngredients);
  return all.map((recipe) => ({
    ...recipe,
    ingredients: ingredients.filter((ingredient) => ingredient.recipeId === recipe.id),
  }));
}

export async function getCatalogItems() {
  return db.select().from(items).orderBy(items.name);
}

export async function lookupShouldHave(query: string) {
  const { searchItems } = await import("../matching");
  const matches = await searchItems(query);
  const results = await Promise.all(
    matches.map(async (item) => {
      const lots = await db
        .select()
        .from(inventoryLots)
        .where(
          and(
            eq(inventoryLots.itemId, item.id),
            eq(inventoryLots.status, "on_hand"),
            sql`${inventoryLots.quantity} > 0`,
          ),
        );
      const lastPurchase = await getLastPurchaseForItem(item.id);
      return { item, lots, lastPurchase };
    }),
  );
  return results;
}
