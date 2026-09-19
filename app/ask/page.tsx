import { AskForm } from "@/components/ask-form";

export const metadata = { title: "Do we have" };

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <main className="grid gap-6">
      <header>
        <h1 className="font-[family-name:var(--font-newsreader)] text-4xl">Do we have it?</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          GroceryKart can tell you if something is marked on hand, or if you bought it two days ago. It cannot see the leftover container in the back of the fridge.
        </p>
      </header>
      <AskForm initialQuery={typeof q === "string" ? q : ""} />
    </main>
  );
}
