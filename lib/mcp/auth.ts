import type { AuthInfo } from "@modelcontextprotocol/server";
import { verifyAccessToken } from "@/lib/oauth/jwt";
import { getOrganizationForUser } from "@/lib/domain/organizations";

/**
 * Verifies a bearer token presented to the MCP endpoint and resolves it to
 * an `AuthInfo` whose `extra` field carries the caller's identity
 * (userId/organizationId/role). `withMcpAuth` calls this per request and
 * attaches the result to that request's `ctx.http.authInfo` — it is never
 * shared across requests or callers (see lib/mcp/tools.ts `callerFromContext`,
 * which reads it fresh on every tool invocation).
 */
export async function verifyMcpToken(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const payload = await verifyAccessToken(bearerToken);
  if (!payload) return undefined;

  const membership = await getOrganizationForUser(payload.userId, payload.organizationId);
  if (!membership) return undefined;

  return {
    token: bearerToken,
    clientId: payload.clientId,
    scopes: [payload.scope],
    extra: {
      userId: payload.userId,
      organizationId: payload.organizationId,
      role: membership.role,
    },
  };
}
