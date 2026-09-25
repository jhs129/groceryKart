import { z } from "zod";
import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { getOnHandLots } from "@/lib/db/queries";
import { addInventoryItem } from "@/lib/domain/inventory";

const addInventoryItemSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  unit: z.string().optional(),
  location: z.string().optional(),
  perishable: z.boolean().optional(),
  purchasedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  quantity: z.number().optional(),
  notes: z.string().optional(),
  store: z.string().optional(),
});

export async function GET(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const lots = await getOnHandLots(caller.organizationId);
  return jsonOk({ lots });
}

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);

  const json = await request.json();
  const parsed = addInventoryItemSchema.safeParse(json);
  if (!parsed.success) return jsonError("Invalid request body", 400);

  try {
    await addInventoryItem(caller, parsed.data);
    return jsonOk({ ok: true }, 201);
  } catch (error) {
    return errorToResponse(error);
  }
}
