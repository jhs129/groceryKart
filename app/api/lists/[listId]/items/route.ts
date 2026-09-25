import { z } from "zod";
import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { getListWithItems } from "@/lib/db/queries";
import { addListItem, toggleListItem } from "@/lib/domain/lists";

const addItemSchema = z.object({
  name: z.string(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  reason: z.string().optional(),
});

const toggleItemSchema = z.object({
  itemId: z.string(),
  checked: z.boolean(),
});

export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);

  const json = await request.json();
  const parsed = addItemSchema.safeParse(json);
  if (!parsed.success) return jsonError("Invalid request body", 400);

  const { listId } = await context.params;

  try {
    // R16: addListItem returns null when the trimmed name was empty, which
    // is a silent no-op rather than success — surface that as a 400.
    const id = await addListItem(caller, { ...parsed.data, listId });
    if (id === null) return jsonError("Item name is required.", 400);
    return jsonOk({ ok: true }, 201);
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ listId: string }> }) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);

  const json = await request.json();
  const parsed = toggleItemSchema.safeParse(json);
  if (!parsed.success) return jsonError("Provide `itemId` and `checked`.", 400);

  const { listId } = await context.params;
  const { itemId, checked } = parsed.data;

  try {
    // R22: verify the toggled item actually belongs to this list before
    // toggling it, since the route accepts `listId` as a path param.
    const list = await getListWithItems(caller.organizationId, listId);
    if (!list) return jsonError("Not found", 404);
    const belongsToList = list.items.some(({ row }) => row.id === itemId);
    if (!belongsToList) return jsonError("Not found", 404);

    await toggleListItem(caller, itemId, checked);
    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
