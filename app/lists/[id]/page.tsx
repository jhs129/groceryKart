import { notFound } from "next/navigation";
import { ListEditor } from "@/components/list-editor";
import { resolveCaller } from "@/app/actions/organizations";
import { getListWithItems } from "@/lib/db/queries";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caller = await resolveCaller();
  const detail = await getListWithItems(caller.organizationId, id);
  if (!detail) notFound();

  return (
    <main className="grid gap-6">
      <header>
        <h1 className="font-[family-name:var(--font-newsreader)] text-4xl">
          {detail.list.name}
        </h1>
        <p className="mt-2 text-ink-soft">Check things off at the store. Inventory does not change until you add them on hand.</p>
      </header>
      <ListEditor
        listId={detail.list.id}
        items={detail.items.map(({ row }) => row)}
      />
    </main>
  );
}
