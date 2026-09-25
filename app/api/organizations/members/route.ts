import { z } from "zod";
import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { listMembers, removeMember } from "@/lib/domain/organizations";

const removeMemberSchema = z.object({
  userId: z.string(),
});

export async function GET(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const members = await listMembers(caller);
  return jsonOk({ members });
}

export async function DELETE(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);

  const json = await request.json();
  const parsed = removeMemberSchema.safeParse(json);
  if (!parsed.success) return jsonError("Invalid request body", 400);

  try {
    await removeMember(caller, parsed.data.userId);
    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
