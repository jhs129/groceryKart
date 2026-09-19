import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { getReceiptWithLines } from "@/lib/db/queries";

export async function GET(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const { receiptId } = await context.params;
  try {
    const receipt = await getReceiptWithLines(caller.organizationId, receiptId);
    if (!receipt) return jsonError("Not found", 404);
    return jsonOk(receipt);
  } catch (error) {
    return errorToResponse(error);
  }
}
