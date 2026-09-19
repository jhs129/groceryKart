import { generateObject } from "ai";
import { z } from "zod";
import { CATEGORIES } from "./types";

const visionModel = "google/gemini-3.5-flash";
const textModel = "openai/gpt-5.4-mini";

const receiptSchema = z.object({
  store: z.string(),
  purchasedAt: z.string().nullable(),
  total: z.number().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().positive(),
      unit: z.string(),
      price: z.number().nullable(),
      category: z.enum(CATEGORIES),
    }),
  ),
});

const recipeSchema = z.object({
  recipes: z.array(
    z.object({
      title: z.string(),
      servings: z.number().int().positive(),
      why: z.string(),
      instructions: z.array(z.string()),
      ingredients: z.array(
        z.object({
          name: z.string(),
          quantity: z.number().nullable(),
          unit: z.string().nullable(),
          onHand: z.boolean(),
        }),
      ),
    }),
  ),
});

const askSchema = z.object({
  answer: z.string(),
  matchedNames: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

export async function extractReceipt(imageDataUrl: string) {
  const { object } = await generateObject({
    model: visionModel,
    schema: receiptSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract grocery receipt line items. Ignore tax, fees, bags, and coupons. Use ordinary kitchen units (each, lb, gal, pack, bunch, loaf). If quantity is missing, use 1. Category should be the closest grocery aisle.",
          },
          { type: "image", image: imageDataUrl },
        ],
      },
    ],
  });
  return object;
}

export async function suggestRecipesFromInventory(inventoryLines: string[]) {
  const { object } = await generateObject({
    model: textModel,
    schema: recipeSchema,
    prompt: `Suggest 3 practical weeknight recipes for a household using ingredients we believe we have on hand. Prefer perishable items that should be used soon. It is okay to need 1-2 extra grocery items.

On-hand inventory:
${inventoryLines.join("\n")}

Mark each ingredient onHand true only if it clearly appears in that list.`,
  });
  return object.recipes;
}

export async function answerInventoryQuestion(input: {
  question: string;
  inventoryLines: string[];
  purchaseLines: string[];
}) {
  const { object } = await generateObject({
    model: textModel,
    schema: askSchema,
    prompt: `You help a household track groceries. Inventory is what we think is still on hand. Purchases are facts about what was bought. We do not know if something was used after it was bought.

Question: ${input.question}

Believed on hand:
${input.inventoryLines.join("\n") || "(nothing)"}

Recent purchases:
${input.purchaseLines.join("\n") || "(none)"}

Answer plainly. If we bought it recently but inventory is empty, say we should have it unless it was already used. Never claim certainty about leftovers.`,
  });
  return object;
}
