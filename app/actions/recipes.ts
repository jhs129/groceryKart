"use server";

import { revalidatePath } from "next/cache";
import { resolveCaller } from "@/app/actions/organizations";
import { generateRecipes as generateRecipesDomain } from "@/lib/domain/recipes";
import { ValidationError } from "@/lib/domain/errors";

export async function generateRecipes() {
  const caller = await resolveCaller();
  try {
    const result = await generateRecipesDomain(caller);
    revalidatePath("/recipes");
    return { ok: true, count: result.count };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    console.error(error);
    return { error: "Recipe suggestions need AI Gateway access. Try again after it is configured." };
  }
}
