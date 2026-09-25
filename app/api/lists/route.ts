import { z } from "zod";
import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { getOpenLists } from "@/lib/db/queries";
import { createShoppingList } from "@/lib/domain/lists";

const createListSchema = z.object({
  name: z.string().optional(),
});

export async function GET(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const lists = await getOpenLists(caller.organizationId);
  return jsonOk({ lists });
}

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);

  const json = await request.json();
  const parsed = createListSchema.safeParse(json);
  if (!parsed.success) return jsonError("Invalid request body", 400);

  try {
    const id = await createShoppingList(caller, parsed.data.name ?? "");
    return jsonOk({ id }, 201);
  } catch (error) {
    return errorToResponse(error);
  }
}
