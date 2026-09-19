import { z } from "zod";
import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { renameOrganization } from "@/lib/domain/organizations";

const renameOrganizationSchema = z.object({
  name: z.string(),
});

export async function PATCH(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);

  const json = await request.json();
  const parsed = renameOrganizationSchema.safeParse(json);
  if (!parsed.success) return jsonError("Invalid request body", 400);

  try {
    await renameOrganization(caller, parsed.data.name);
    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
