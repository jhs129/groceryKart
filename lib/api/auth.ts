import { verifyAccessToken } from "@/lib/oauth/jwt";
import { getOrganizationForUser } from "@/lib/domain/organizations";
import type { Caller } from "@/lib/domain/caller";

export async function authenticateRequest(request: Request): Promise<Caller | null> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  // Re-check current membership/role rather than trusting the JWT claims,
  // so a removed member's still-valid access token is rejected.
  const membership = await getOrganizationForUser(payload.userId, payload.organizationId);
  if (!membership) return null;

  return { userId: payload.userId, organizationId: payload.organizationId, role: membership.role };
}
