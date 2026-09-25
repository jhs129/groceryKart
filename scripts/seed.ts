import { eq } from "drizzle-orm";
import { GROCERY_CATALOG } from "../lib/catalog";
import { db } from "../lib/db";
import {
  inventoryLots,
  items,
  organizations,
  purchases,
  receiptLines,
  receipts,
  recipeIngredients,
  recipes,
  shoppingListItems,
  shoppingLists,
} from "../lib/db/schema";
import { normalizeName } from "../lib/matching";

const SEED_ORG_JOIN_CODE = "SEED-HOUSEHOLD";
const SEED_ORG_NAME = "Seed Household";

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function seed() {
  await db.delete(recipeIngredients);
  await db.delete(recipes);
  await db.delete(shoppingListItems);
  await db.delete(shoppingLists);
  await db.delete(inventoryLots);
  await db.delete(purchases);
  await db.delete(receiptLines);
  await db.delete(receipts);
  await db.delete(items);

  const existingOrg = await db.query.organizations.findFirst({
    where: eq(organizations.joinCode, SEED_ORG_JOIN_CODE),
  });

  const org =
    existingOrg ??
    (
      await db
        .insert(organizations)
        .values({ name: SEED_ORG_NAME, joinCode: SEED_ORG_JOIN_CODE })
        .returning()
    )[0];

  const inserted = await db
    .insert(items)
    .values(
      GROCERY_CATALOG.map((item) => ({
        organizationId: org.id,
        name: item.name,
        normalizedName: normalizeName(item.name),
        category: item.category,
        defaultUnit: item.defaultUnit,
        typicalShelfLifeDays: item.typicalShelfLifeDays,
        perishable: item.perishable,
        defaultLocation: item.defaultLocation,
        aliases: item.aliases ?? [],
      })),
    )
    .returning();

  const byName = new Map(inserted.map((item) => [item.name, item]));
  const requireItem = (name: string) => {
    const item = byName.get(name);
    if (!item) throw new Error(`Missing catalog item: ${name}`);
    return item;
  };

  const milk = requireItem("Whole milk");
  const spinach = requireItem("Baby spinach");
  const eggs = requireItem("Eggs");
  const bread = requireItem("Sourdough bread");
  const bananas = requireItem("Bananas");
  const yogurt = requireItem("Greek yogurt");
  const chicken = requireItem("Chicken thighs");
  const onion = requireItem("Yellow onion");
  const garlic = requireItem("Garlic");
  const oil = requireItem("Olive oil");
  const tomatoes = requireItem("Canned tomatoes");
  const rice = requireItem("Rice");
  const pasta = requireItem("Pasta");
  const cheese = requireItem("Cheddar cheese");

  await db.insert(purchases).values([
    { organizationId: org.id, itemId: milk.id, quantity: 1, unit: "gal", purchasedAt: daysAgo(2), store: "Kroger", rawName: "WHOLE MILK 1GAL" },
    { organizationId: org.id, itemId: spinach.id, quantity: 1, unit: "bag", purchasedAt: daysAgo(5), store: "Kroger", rawName: "ORG BABY SPINACH" },
    { organizationId: org.id, itemId: eggs.id, quantity: 1, unit: "dozen", purchasedAt: daysAgo(8), store: "Kroger", rawName: "LG EGGS 12CT" },
    { organizationId: org.id, itemId: bread.id, quantity: 1, unit: "loaf", purchasedAt: daysAgo(3), store: "Kroger", rawName: "SOURDOUGH LOAF" },
    { organizationId: org.id, itemId: bananas.id, quantity: 1, unit: "bunch", purchasedAt: daysAgo(3), store: "Kroger", rawName: "BANANAS" },
    { organizationId: org.id, itemId: yogurt.id, quantity: 2, unit: "each", purchasedAt: daysAgo(6), store: "Kroger", rawName: "GREEK YOGURT" },
    { organizationId: org.id, itemId: chicken.id, quantity: 2, unit: "lb", purchasedAt: daysAgo(10), store: "Kroger", rawName: "CHICKEN THIGHS" },
  ]);

  await db.insert(inventoryLots).values([
    { organizationId: org.id, itemId: milk.id, quantity: 1, unit: "gal", location: "fridge", purchasedAt: daysAgo(2), expiresAt: daysFromNow(5), status: "on_hand" },
    { organizationId: org.id, itemId: spinach.id, quantity: 1, unit: "bag", location: "fridge", purchasedAt: daysAgo(5), expiresAt: daysFromNow(1), status: "on_hand" },
    { organizationId: org.id, itemId: eggs.id, quantity: 1, unit: "dozen", location: "fridge", purchasedAt: daysAgo(8), expiresAt: daysFromNow(13), status: "on_hand" },
    { organizationId: org.id, itemId: bread.id, quantity: 1, unit: "loaf", location: "counter", purchasedAt: daysAgo(3), expiresAt: daysFromNow(1), status: "on_hand" },
    { organizationId: org.id, itemId: bananas.id, quantity: 1, unit: "bunch", location: "counter", purchasedAt: daysAgo(3), expiresAt: new Date(), status: "on_hand" },
    { organizationId: org.id, itemId: yogurt.id, quantity: 2, unit: "each", location: "fridge", purchasedAt: daysAgo(6), expiresAt: daysFromNow(2), status: "on_hand" },
    { organizationId: org.id, itemId: chicken.id, quantity: 2, unit: "lb", location: "freezer", purchasedAt: daysAgo(10), expiresAt: daysFromNow(80), status: "on_hand" },
    { organizationId: org.id, itemId: onion.id, quantity: 4, unit: "each", location: "pantry", purchasedAt: daysAgo(12), expiresAt: daysFromNow(18), status: "on_hand" },
    { organizationId: org.id, itemId: garlic.id, quantity: 1, unit: "each", location: "pantry", purchasedAt: daysAgo(20), expiresAt: daysFromNow(25), status: "on_hand" },
    { organizationId: org.id, itemId: oil.id, quantity: 1, unit: "bottle", location: "pantry", purchasedAt: daysAgo(40), status: "on_hand" },
    { organizationId: org.id, itemId: tomatoes.id, quantity: 3, unit: "can", location: "pantry", purchasedAt: daysAgo(30), status: "on_hand" },
    { organizationId: org.id, itemId: rice.id, quantity: 2, unit: "lb", location: "pantry", purchasedAt: daysAgo(50), status: "on_hand" },
    { organizationId: org.id, itemId: pasta.id, quantity: 2, unit: "box", location: "pantry", purchasedAt: daysAgo(18), status: "on_hand" },
    { organizationId: org.id, itemId: cheese.id, quantity: 0.5, unit: "lb", location: "fridge", purchasedAt: daysAgo(9), expiresAt: daysFromNow(8), status: "on_hand" },
  ]);

  const [list] = await db
    .insert(shoppingLists)
    .values({ organizationId: org.id, name: "This week's kart" })
    .returning();

  await db.insert(shoppingListItems).values([
    { listId: list.id, itemId: requireItem("Coffee").id, name: "Coffee", quantity: 1, unit: "bag", reason: "manual" },
    { listId: list.id, itemId: requireItem("Lemons").id, name: "Lemons", quantity: 4, unit: "each", reason: "manual" },
    { listId: list.id, itemId: requireItem("Butter").id, name: "Butter", quantity: 1, unit: "each", reason: "low_stock" },
    { listId: list.id, name: "Paper towels", quantity: 1, unit: "pack", reason: "manual" },
  ]);

  const [recipe] = await db
    .insert(recipes)
    .values({
      organizationId: org.id,
      title: "Spinach omelette",
      servings: 2,
      source: "seed",
      instructions:
        "Beat the eggs with a pinch of salt. Wilt the spinach in a slick of olive oil with minced onion. Pour in the eggs, fold, and finish with cheddar.",
    })
    .returning();

  await db.insert(recipeIngredients).values([
    { recipeId: recipe.id, itemId: eggs.id, name: "Eggs", quantity: 4, unit: "each", onHand: true },
    { recipeId: recipe.id, itemId: spinach.id, name: "Baby spinach", quantity: 1, unit: "bag", onHand: true },
    { recipeId: recipe.id, itemId: onion.id, name: "Yellow onion", quantity: 0.25, unit: "each", onHand: true },
    { recipeId: recipe.id, itemId: cheese.id, name: "Cheddar cheese", quantity: 0.25, unit: "lb", onHand: true },
  ]);

  console.log(`Seeded ${inserted.length} catalog items and a starter pantry.`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
