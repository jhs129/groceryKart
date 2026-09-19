import { suggestRecipesFromInventory } from "@/lib/ai";
import { db } from "@/lib/db";
import { getOnHandLots } from "@/lib/db/queries";
import { recipeIngredients, recipes } from "@/lib/db/schema";
import { formatQty } from "@/lib/format";
import { findMatchingItem } from "@/lib/matching";
import { ValidationError } from "./errors";
import type { Caller } from "./caller";

export async function generateRecipes(caller: Caller): Promise<{ count: number }> {
  const lots = await getOnHandLots(caller.organizationId);
  if (lots.length === 0) {
    throw new ValidationError("Add some inventory first so recipes have something to cook with.");
  }

  const inventoryLines = lots.map(
    ({ item, lot }) =>
      `${item.name} — ${formatQty(lot.quantity, lot.unit)} in the ${lot.location}${lot.expiresAt ? `, use by ${lot.expiresAt.toISOString().slice(0, 10)}` : ""}`,
  );

  const suggestions = await suggestRecipesFromInventory(inventoryLines);
  const saved: string[] = [];

  for (const suggestion of suggestions) {
    const [recipe] = await db
      .insert(recipes)
      .values({
        organizationId: caller.organizationId,
        title: suggestion.title,
        servings: suggestion.servings,
        instructions: `${suggestion.why}\n\n${suggestion.instructions.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
        source: "ai",
      })
      .returning();

    for (const ingredient of suggestion.ingredients) {
      const match = await findMatchingItem(caller.organizationId, ingredient.name);
      await db.insert(recipeIngredients).values({
        recipeId: recipe.id,
        itemId: match?.id ?? null,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        onHand: ingredient.onHand,
      });
    }
    saved.push(recipe.id);
  }

  return { count: saved.length };
}
