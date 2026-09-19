"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addMissingIngredientsToList } from "@/app/actions/lists";
import { generateRecipes } from "@/app/actions/recipes";

export function GenerateRecipesButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={pending}
        className="h-11 w-fit bg-herb px-4 font-medium text-white disabled:opacity-60"
        onClick={() =>
          start(async () => {
            const result = await generateRecipes();
            setMessage(result.error ?? `Saved ${result.count} recipes from what looks on hand.`);
            router.refresh();
          })
        }
      >
        {pending ? "Thinking through the pantry…" : "Suggest recipes from on-hand food"}
      </button>
      {message ? <p className="text-sm text-ink-soft">{message}</p> : null}
    </div>
  );
}

export function AddMissingButton({
  missing,
}: {
  missing: { name: string; quantity: number | null; unit: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (missing.length === 0) return null;

  return (
    <button
      type="button"
      disabled={pending}
      className="h-11 border border-line px-4"
      onClick={() =>
        start(async () => {
          const listId = await addMissingIngredientsToList(missing);
          router.push(`/lists/${listId}`);
        })
      }
    >
      Add missing to kart
    </button>
  );
}
