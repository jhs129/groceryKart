import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthClients } from "@/lib/db/schema";

export async function registerClient(name: string, redirectUris: string[]) {
  const [client] = await db
    .insert(oauthClients)
    .values({ name, redirectUris })
    .returning();
  return { clientId: client.id };
}

export async function getClient(clientId: string) {
  const client = await db.query.oauthClients.findFirst({
    where: eq(oauthClients.id, clientId),
  });
  if (!client) return null;
  return { id: client.id, name: client.name, redirectUris: client.redirectUris };
}
