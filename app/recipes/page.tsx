import { AddMissingButton, GenerateRecipesButton } from "@/components/recipe-actions";
import { resolveCaller } from "@/app/actions/organizations";
import { getRecipes } from "@/lib/db/queries";

export const metadata = { title: "Cook" };

export default async function RecipesPage() {
  const caller = await resolveCaller();
  const recipes = await getRecipes(caller.organizationId);

  return (
    <main className="grid gap-8">
      <header className="grid gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-newsreader)] text-4xl">Cook</h1>
          <p className="mt-2 max-w-xl text-ink-soft">
            Recipes lean on what GroceryKart thinks you still have, especially food that is close to turning.
          </p>
        </div>
        <GenerateRecipesButton />
      </header>
      {recipes.length === 0 ? (
        <p className="text-ink-soft">No recipes yet. Generate a few from the pantry.</p>
      ) : (
        <ul className="grid gap-6">
          {recipes.map((recipe) => {
            const missing = recipe.ingredients.filter((ingredient) => !ingredient.onHand);
            return (
              <li key={recipe.id} className="border border-line bg-tile p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-[family-name:var(--font-newsreader)] text-2xl">
                      {recipe.title}
                    </h2>
                    <p className="text-sm text-ink-soft">{recipe.servings} servings</p>
                  </div>
                  <AddMissingButton
                    missing={missing.map((ingredient) => ({
                      name: ingredient.name,
                      quantity: ingredient.quantity,
                      unit: ingredient.unit,
                    }))}
                  />
                </div>
                <ul className="mt-4 grid gap-1 text-sm">
                  {recipe.ingredients.map((ingredient) => (
                    <li key={ingredient.id} className={ingredient.onHand ? "" : "text-clementine"}>
                      {ingredient.name}
                      {ingredient.quantity
                        ? ` · ${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ""}`
                        : ""}
                      {ingredient.onHand ? " · on hand" : " · need"}
                    </li>
                  ))}
                </ul>
                <pre className="mt-4 font-sans text-sm leading-6 whitespace-pre-wrap text-ink-soft">
                  {recipe.instructions}
                </pre>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
