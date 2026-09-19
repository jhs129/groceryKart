"use server";

import { answerInventoryQuestion } from "@/lib/ai";
import { getOnHandLots, getRecentPurchases, lookupShouldHave } from "@/lib/db/queries";
import { formatDate, formatQty } from "@/lib/format";

export type AskResult = {
  question: string;
  answer: string;
  confidence: "high" | "medium" | "low";
  matches: {
    name: string;
    onHand: string | null;
    lastBought: string | null;
  }[];
};

export async function askAboutGroceries(formData: FormData): Promise<AskResult> {
  const question = String(formData.get("q") ?? "").trim();
  if (!question) {
    return {
      question,
      answer: "Ask whether the house should still have something.",
      confidence: "low",
      matches: [],
    };
  }

  const [structured, lots, purchases] = await Promise.all([
    lookupShouldHave(question),
    getOnHandLots(),
    getRecentPurchases(21),
  ]);

  const matches = structured.map((row) => ({
    name: row.item.name,
    onHand:
      row.lots.length > 0
        ? row.lots
            .map((lot) => `${formatQty(lot.quantity, lot.unit)} in the ${lot.location}`)
            .join("; ")
        : null,
    lastBought: row.lastPurchase
      ? `${formatDate(row.lastPurchase.purchasedAt)}${row.lastPurchase.store ? ` at ${row.lastPurchase.store}` : ""}`
      : null,
  }));

  if (question.split(/\s+/).length <= 4 && matches.length > 0) {
    const first = matches[0];
    let answer = `No current inventory for ${first.name}.`;
    if (first.onHand) {
      answer = `Inventory still shows ${first.name}: ${first.onHand}. We have not tracked whether it was used.`;
    } else if (first.lastBought) {
      answer = `Nothing is marked on hand, but ${first.name} was bought ${first.lastBought}. We should have it unless it already got used.`;
    }
    return { question, answer, confidence: first.onHand ? "high" : "medium", matches };
  }

  try {
    const ai = await answerInventoryQuestion({
      question,
      inventoryLines: lots.map(
        ({ item, lot }) => `${item.name}: ${formatQty(lot.quantity, lot.unit)} (${lot.location})`,
      ),
      purchaseLines: purchases.map(
        ({ item, purchase }) =>
          `${item.name} bought ${formatDate(purchase.purchasedAt)}${purchase.store ? ` at ${purchase.store}` : ""}`,
      ),
    });
    return {
      question,
      answer: ai.answer,
      confidence: ai.confidence,
      matches,
    };
  } catch {
    if (matches.length > 0) {
      return {
        question,
        answer: matches
          .map((match) =>
            match.onHand
              ? `${match.name} looks on hand (${match.onHand}).`
              : `${match.name} is not in inventory${match.lastBought ? `, last bought ${match.lastBought}` : ""}.`,
          )
          .join(" "),
        confidence: "medium",
        matches,
      };
    }
    return {
      question,
      answer:
        "No matching item in the catalog, and AI lookup is unavailable. Try a simpler name like milk or eggs.",
      confidence: "low",
      matches,
    };
  }
}
