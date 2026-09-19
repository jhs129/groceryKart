"use client";

import { useState, useTransition } from "react";
import { askAboutGroceries, type AskResult } from "@/app/actions/ask";

export function AskForm({ initialQuery = "" }: { initialQuery?: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AskResult | null>(null);

  return (
    <div className="grid gap-6">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          start(async () => {
            setResult(await askAboutGroceries(formData));
          });
        }}
      >
        <input
          name="q"
          defaultValue={initialQuery}
          placeholder="Do we still have milk?"
          className="h-12 flex-1 border border-line bg-paper px-4 text-lg"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-12 bg-ink px-5 font-medium text-paper disabled:opacity-60"
        >
          {pending ? "Checking…" : "Check the house"}
        </button>
      </form>
      {result ? (
        <section className="border border-line bg-tile p-5">
          <p className="font-[family-name:var(--font-newsreader)] text-2xl leading-snug">
            {result.answer}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Confidence: {result.confidence}. GroceryKart does not know if someone already used it.
          </p>
          {result.matches.length > 0 ? (
            <ul className="mt-4 grid gap-2">
              {result.matches.map((match) => (
                <li key={match.name} className="border-t border-line pt-2 text-sm">
                  <span className="font-medium">{match.name}</span>
                  <span className="text-ink-soft">
                    {match.onHand ? ` · on hand: ${match.onHand}` : " · not in inventory"}
                    {match.lastBought ? ` · last bought ${match.lastBought}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
