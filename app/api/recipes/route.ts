import { authenticateRequest } from "@/lib/api/auth";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api/respond";
import { getRecipes } from "@/lib/db/queries";
import { generateRecipes } from "@/lib/domain/recipes";

export async function GET(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  const recipes = await getRecipes(caller.organizationId);
  return jsonOk({ recipes });
}

export async function POST(request: Request) {
  const caller = await authenticateRequest(request);
  if (!caller) return jsonError("Unauthorized", 401);
  try {
    const result = await generateRecipes(caller);
    return jsonOk(result, 201);
  } catch (error) {
    return errorToResponse(error);
  }
}
