import { z } from "zod";
import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { adjustLotQuantity, markLotGone } from "@/lib/domain/inventory";

const patchLotSchema = z.object({
  quantity: z.number().optional(),
  status: z.enum(["used_up", "discarded"]).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ lotId: string }> }) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);

  const json = await request.json();
  const parsed = patchLotSchema.safeParse(json);
  if (!parsed.success) return jsonError("Invalid request body", 400);

  const { lotId } = await context.params;
  const body = parsed.data;

  try {
    if (typeof body.quantity === "number") {
      await adjustLotQuantity(caller, lotId, body.quantity);
    } else if (body.status === "used_up" || body.status === "discarded") {
      await markLotGone(caller, lotId, body.status);
    } else {
      return jsonError("Provide either `quantity` or `status`.", 400);
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
