import Link from "next/link";
import { createShoppingList } from "@/app/actions/lists";
import { getOpenLists, getListWithItems } from "@/lib/db/queries";
import { redirect } from "next/navigation";

export const metadata = { title: "Kart" };

export default async function ListsPage() {
  const lists = await getOpenLists();
  const withCounts = await Promise.all(
    lists.map(async (list) => {
      const detail = await getListWithItems(list.id);
      const remaining =
        detail?.items.filter((row) => !row.row.checked).length ?? 0;
      return { list, remaining };
    }),
  );

  async function createList(formData: FormData) {
    "use server";
    const id = await createShoppingList(formData);
    redirect(`/lists/${id}`);
  }

  return (
    <main className="grid gap-8">
      <header>
        <h1 className="font-[family-name:var(--font-newsreader)] text-4xl">Kart</h1>
        <p className="mt-2 max-w-xl text-ink-soft">
          Shopping lists for what the house is out of, plus missing pieces from recipes.
        </p>
      </header>
      <form action={createList} className="flex gap-2">
        <input
          name="name"
          placeholder="Saturday run"
          className="h-11 flex-1 border border-line bg-paper px-3"
        />
        <button type="submit" className="h-11 bg-clementine px-4 font-medium text-white">
          New list
        </button>
      </form>
      {withCounts.length === 0 ? (
        <p className="text-ink-soft">No open lists.</p>
      ) : (
        <ul className="grid gap-2">
          {withCounts.map(({ list, remaining }) => (
            <li key={list.id}>
              <Link
                href={`/lists/${list.id}`}
                className="flex items-center justify-between border border-line bg-tile px-4 py-3"
              >
                <span className="font-medium">{list.name}</span>
                <span className="text-sm text-ink-soft">{remaining} to buy</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
