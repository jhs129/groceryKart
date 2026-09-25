import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { askAboutGroceries } from "@/lib/domain/ask";

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const body = await request.json();
  try {
    const result = await askAboutGroceries(caller, String(body.question ?? ""));
    return jsonOk(result);
  } catch (error) {
    return errorToResponse(error);
  }
}
