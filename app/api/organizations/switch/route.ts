import { z } from "zod";
import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { switchActiveOrganization } from "@/lib/domain/organizations";

const switchOrganizationSchema = z.object({
  organizationId: z.string(),
});

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);

  const json = await request.json();
  const parsed = switchOrganizationSchema.safeParse(json);
  if (!parsed.success) return jsonError("Invalid request body", 400);

  try {
    await switchActiveOrganization(caller.userId, parsed.data.organizationId);
    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
