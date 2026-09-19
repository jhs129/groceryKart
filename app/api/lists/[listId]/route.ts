import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { getListWithItems } from "@/lib/db/queries";

export async function GET(request: Request, context: { params: Promise<{ listId: string }> }) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const { listId } = await context.params;
  try {
    const list = await getListWithItems(caller.organizationId, listId);
    if (!list) return jsonError("Not found", 404);
    return jsonOk(list);
  } catch (error) {
    return errorToResponse(error);
  }
}
