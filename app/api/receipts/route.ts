import { z } from "zod";
import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { getReceipts } from "@/lib/db/queries";
import { confirmReceipt } from "@/lib/domain/receipts";

const confirmReceiptSchema = z.object({
  store: z.string(),
  purchasedAt: z.string(),
  total: z.number().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      unit: z.string(),
      price: z.number().nullable(),
      category: z.string(),
      addToInventory: z.boolean(),
    }),
  ),
});

export async function GET(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const receipts = await getReceipts(caller.organizationId);
  return jsonOk({ receipts });
}

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);

  const json = await request.json();
  const parsed = confirmReceiptSchema.safeParse(json);
  if (!parsed.success) return jsonError("Invalid request body", 400);

  try {
    const result = await confirmReceipt(caller, parsed.data);
    return jsonOk(result, 201);
  } catch (error) {
    return errorToResponse(error);
  }
}
